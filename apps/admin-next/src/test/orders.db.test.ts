/** Database tests for checkout, payment confirmation and delivery. Need TEST_DATABASE_URL. */
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { eq, inArray, like } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase, orderItems, orders, programs, volumes, type Database, type Volume } from '@tilana/db';
import type { BasketCheckoutRequest } from '@tilana/contracts/checkout';
import { POST as startBasket } from '@/app/api/checkout/paystack/basket/route';
import { GET as checkoutStatus } from '@/app/api/checkout/status/route';
import { POST as webhook } from '@/app/api/webhooks/paystack/route';
import { deliverOrder, resendOrder } from '@/server/services/order-delivery';
import { applySesEvent } from '@/server/services/ses-events';
import { applyVerifiedPayment, CheckoutAlreadyStartedError, findOrderBy, startCheckout } from '@/server/services/orders';
import { isProgramInAnyOrder } from '@/server/services/programs';
import { dayRange, findOrders, salesSummary, salesToday } from '@/server/services/sales';
import type { OutgoingEmail } from '@/server/utils/email-routing';
import type { VerifiedPayment } from '@/server/utils/paystack';

const url = process.env.TEST_DATABASE_URL;
const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const pdf = (n: number) => ({ filePath: `programs/${n}/v1-abc.pdf`, fileName: `Tilana van Tonder - P${n}.pdf`, fileSizeBytes: 10, fileSha256: 'c'.repeat(64), fileVersion: 1, fileUploadedAt: new Date() });

describe.skipIf(!url)('orders (database)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let volume: Volume;
  const deps = (initialize = vi.fn(async () => ({ authorizationUrl: 'https://checkout.paystack.com/abc' }))) => ({ mode: 'test' as const, websiteUrl: 'https://site.test', initialize });
  const request = (overrides: Partial<BasketCheckoutRequest> = {}): BasketCheckoutRequest => ({
    idempotencyKey: randomUUID(),
    items: [{ volumeSlug: 'test-shop-a', expectedPriceCents: 39_900 }, { volumeSlug: 'test-shop-b', expectedPriceCents: 49_900 }],
    firstName: 'Anna', lastName: 'Smit', email: 'Anna@Example.com', phone: '', consent: true, website: '', turnstileToken: '',
    ...overrides,
  });
  const success = (order: { reference: string; totalCents: number }, overrides: Partial<VerifiedPayment> = {}): VerifiedPayment => ({
    status: 'success', reference: order.reference, amountCents: order.totalCents, requestedAmountCents: order.totalCents, feeCents: 1_257, currency: 'ZAR', mode: 'test',
    transactionId: '99', channel: 'card', paidAt: new Date(), ...overrides,
  });

  beforeAll(async () => {
    ({ db, close } = createDatabase(url!, { max: 1 }));
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../../../packages/db/migrations', import.meta.url)) });
    await db.delete(orders).where(like(orders.email, '%@example.com'));
    await db.delete(programs).where(like(programs.slug, 'test-shop-%'));
    await db.delete(volumes).where(inArray(volumes.number, [92]));
    [volume] = await db.insert(volumes).values({ number: 92, name: 'Volume 92', isActive: true }).returning() as [Volume];
    await db.insert(programs).values([
      { volumeId: volume.id, slug: 'test-shop-a', name: 'Shop A', priceCents: 39_900, ...pdf(1) },
      { volumeId: volume.id, slug: 'test-shop-b', name: 'Shop B', priceCents: 49_900, ...pdf(2) },
      { volumeId: volume.id, slug: 'test-shop-nopdf', name: 'No PDF', priceCents: 39_900 },
    ]);
  });

  afterAll(async () => {
    await db.delete(orders).where(like(orders.email, '%@example.com'));
    await db.delete(programs).where(like(programs.slug, 'test-shop-%'));
    await db.delete(volumes).where(eq(volumes.id, volume.id));
    await close?.();
  });

  it('saves a pending order with database prices before sending the buyer to Paystack', async () => {
    const initialize = vi.fn(async () => ({ authorizationUrl: 'https://checkout.paystack.com/abc' }));
    const input = request();
    const result = await startCheckout(db, input, deps(initialize));
    const order = (await findOrderBy(db, 'reference', result.reference))!;
    expect(order).toMatchObject({ status: 'pending', totalCents: 89_800, email: 'anna@example.com', paymentMode: 'test', authorizationUrl: 'https://checkout.paystack.com/abc' });
    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({
      amountCents: 89_800, reference: order.reference, callbackUrl: `https://site.test/checkout/complete?reference=${order.reference}`,
    }));
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    expect(items.map(item => [item.label, item.priceCents])).toEqual([['Shop A · Volume 92', 39_900], ['Shop B · Volume 92', 49_900]]);

    // A retry with the same key reuses the order and the payment page.
    expect(await startCheckout(db, input, deps())).toEqual(result);
    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it('refuses changed prices and programs that are not for sale', async () => {
    await expect(startCheckout(db, request({ items: [{ volumeSlug: 'test-shop-a', expectedPriceCents: 100 }] }), deps())).rejects.toThrow('price');
    await expect(startCheckout(db, request({ items: [{ volumeSlug: 'test-shop-nopdf', expectedPriceCents: 39_900 }] }), deps())).rejects.toThrow('no longer available');
    await expect(startCheckout(db, request({ items: [{ volumeSlug: 'nope', expectedPriceCents: 39_900 }] }), deps())).rejects.toThrow('no longer available');
  });

  it('removes the order when Paystack cannot start the payment, so the buyer can retry', async () => {
    const input = request();
    const failing = vi.fn(async () => { throw new Error('down'); });
    await expect(startCheckout(db, input, deps(failing))).rejects.toThrow('could not be started');
    expect(await findOrderBy(db, 'idempotencyKey', input.idempotencyKey)).toBeUndefined();
  });

  it('marks the order paid only for a matching payment, and only once', async () => {
    const { reference } = await startCheckout(db, request(), deps());
    const order = (await findOrderBy(db, 'reference', reference))!;
    // A mismatch is flagged for review once, never marked paid.
    expect(await applyVerifiedPayment(db, order, success(order, { amountCents: 100 }))).toEqual({ status: 'pending', justPaid: false, flagged: true });
    expect(await applyVerifiedPayment(db, order, success(order, { mode: 'live' }))).toEqual({ status: 'pending', justPaid: false, flagged: false });
    expect(await applyVerifiedPayment(db, order, { ...success(order), status: 'ongoing' })).toEqual({ status: 'pending', justPaid: false });

    const [first, second] = await Promise.all([applyVerifiedPayment(db, order, success(order)), applyVerifiedPayment(db, order, success(order))]);
    expect([first.justPaid, second.justPaid].sort()).toEqual([false, true]);
    expect((await findOrderBy(db, 'reference', reference))).toMatchObject({ status: 'paid', paystackTransactionId: '99', paymentChannel: 'card' });

    // The same checkout cannot be paid again.
    const again = { ...request(), idempotencyKey: order.idempotencyKey };
    await expect(startCheckout(db, again, deps())).rejects.toBeInstanceOf(CheckoutAlreadyStartedError);
  });

  it('records failed and abandoned payments, and still accepts a later success', async () => {
    const { reference } = await startCheckout(db, request(), deps());
    const order = (await findOrderBy(db, 'reference', reference))!;
    expect((await applyVerifiedPayment(db, order, { ...success(order), status: 'abandoned' })).status).toBe('abandoned');
    expect((await findOrderBy(db, 'reference', reference))!.status).toBe('abandoned');
    expect((await applyVerifiedPayment(db, order, success(order))).justPaid).toBe(true);
  });

  it('keeps a program that is in an unpaid checkout (the payment may still arrive)', async () => {
    const [unsold] = await db.select().from(programs).where(eq(programs.slug, 'test-shop-nopdf'));
    expect(await isProgramInAnyOrder(db, unsold!.id)).toBe(false);
    await startCheckout(db, request(), deps());
    const [inCheckout] = await db.select().from(programs).where(eq(programs.slug, 'test-shop-a'));
    expect(await isProgramInAnyOrder(db, inCheckout!.id)).toBe(true);
  });

  it('emails the PDFs once paid and tells Tilana', async () => {
    vi.stubEnv('WEBSITE_URL', 'https://site.test');
    vi.stubEnv('CONTACT_NOTIFY_TO', 'tilana@example.com');
    const { reference } = await startCheckout(db, request(), deps());
    const order = (await findOrderBy(db, 'reference', reference))!;
    await applyVerifiedPayment(db, order, success(order));
    const sent: OutgoingEmail[] = [];
    await deliverOrder(db, order.id, { send: async (email) => void sent.push(email), download: async () => Buffer.from('%PDF-1.7 %%EOF') });
    expect(sent.map(email => email.to[0])).toEqual(['anna@example.com', 'tilana@example.com']);
    expect(sent[0]!.attachments?.map(file => file.fileName)).toEqual(['Tilana van Tonder - P1.pdf', 'Tilana van Tonder - P2.pdf']);
    expect(sent[1]!.subject).toContain('New sale');
    expect((await findOrderBy(db, 'reference', reference))).toMatchObject({ deliveryStatus: 'sent', deliveryError: null });
    vi.unstubAllEnvs();
  });

  it('sends each buyer a personalised copy and keeps its fingerprint; a resend is identical', async () => {
    vi.stubEnv('WEBSITE_URL', 'https://site.test');
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    const clean = Buffer.from(await doc.save());
    const { reference } = await startCheckout(db, request(), deps());
    const order = (await findOrderBy(db, 'reference', reference))!;
    await applyVerifiedPayment(db, order, success(order));
    const sent: OutgoingEmail[] = [];
    const mail = { send: async (email: OutgoingEmail) => void sent.push(email), download: async () => clean };
    await deliverOrder(db, order.id, mail);

    const attached = Buffer.from(sent[0]!.attachments![0]!.data);
    expect(attached.equals(clean)).toBe(false);
    const copy = await PDFDocument.load(attached, { updateMetadata: false });
    expect(copy.getKeywords()).toContain(`tvt-order:${order.orderNumber}`);
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    expect(items.map(item => item.deliveredSha256)).toEqual([sha256(attached), expect.stringMatching(/^[0-9a-f]{64}$/)]);

    sent.length = 0;
    await resendOrder(db, order.orderNumber, {}, mail);
    expect(sha256(Buffer.from(sent[0]!.attachments![0]!.data))).toBe(items[0]!.deliveredSha256);
    vi.unstubAllEnvs();
  });

  it('still sends the program when a PDF cannot be personalised', async () => {
    vi.stubEnv('WEBSITE_URL', 'https://site.test');
    const { reference } = await startCheckout(db, request(), deps());
    const order = (await findOrderBy(db, 'reference', reference))!;
    await applyVerifiedPayment(db, order, success(order));
    const sent: OutgoingEmail[] = [];
    const broken = Buffer.from('%PDF-1.7 %%EOF');
    await deliverOrder(db, order.id, { send: async (email) => void sent.push(email), download: async () => broken });
    expect(Buffer.from(sent[0]!.attachments![0]!.data).equals(broken)).toBe(true);
    expect(await findOrderBy(db, 'reference', reference)).toMatchObject({ deliveryStatus: 'sent' });
    vi.unstubAllEnvs();
  });

  it('records a failed delivery instead of losing it', async () => {
    vi.stubEnv('WEBSITE_URL', 'https://site.test');
    const { reference } = await startCheckout(db, request(), deps());
    const order = (await findOrderBy(db, 'reference', reference))!;
    await applyVerifiedPayment(db, order, success(order));
    await deliverOrder(db, order.id, { send: async () => { throw new Error('SES down'); }, download: async () => Buffer.from('x') });
    expect((await findOrderBy(db, 'reference', reference))).toMatchObject({ deliveryStatus: 'failed', deliveryError: 'SES down' });
    vi.unstubAllEnvs();
  });

  it('marks the order not sent when the PDF email bounces', async () => {
    vi.stubEnv('WEBSITE_URL', 'https://site.test');
    const { reference } = await startCheckout(db, request(), deps());
    const order = (await findOrderBy(db, 'reference', reference))!;
    await applyVerifiedPayment(db, order, success(order));
    const messageId = `ses-${randomUUID()}`;
    await deliverOrder(db, order.id, { send: async () => ({ messageId }), download: async () => Buffer.from('%PDF-1.7 %%EOF') });
    expect(await findOrderBy(db, 'reference', reference)).toMatchObject({ deliveryStatus: 'sent', deliveryMessageIds: [messageId] });
    await applySesEvent(db, { notificationType: 'Bounce', mail: { messageId }, bounce: { bounceType: 'Permanent', bounceSubType: 'General', bouncedRecipients: [{ emailAddress: 'anna@example.com', diagnosticCode: 'mailbox full' }] } });
    const after = (await findOrderBy(db, 'reference', reference))!;
    expect(after.deliveryStatus).toBe('failed');
    expect(after.deliveryError).toContain('refused the PDFs');
    expect(after.deliveryAttempts).toBe(4);
    vi.unstubAllEnvs();
  });

  it('accepts only signed Paystack webhooks and then verifies the payment with Paystack', async () => {
    vi.stubEnv('DATABASE_URL', url!);
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_webhook');
    vi.stubEnv('PAYSTACK_MODE', 'test');
    const { reference } = await startCheckout(db, request(), deps());
    const order = (await findOrderBy(db, 'reference', reference))!;
    const body = JSON.stringify({ event: 'charge.success', data: { reference } });
    const post = (signature: string) => webhook(new Request('http://admin.test/api/webhooks/paystack', { method: 'POST', body, headers: { 'x-paystack-signature': signature } }));

    expect((await post('f'.repeat(128))).status).toBe(401);
    expect((await findOrderBy(db, 'reference', reference))!.status).toBe('pending');

    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: true, data: { status: 'success', reference, amount: order.totalCents, currency: 'ZAR', domain: 'test', id: 7, channel: 'card', paid_at: new Date().toISOString() } })));
    const response = await post(createHmac('sha512', 'sk_test_webhook').update(body).digest('hex'));
    expect(response.status).toBe(200);
    expect((await findOrderBy(db, 'reference', reference))!.status).toBe('paid');
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('runs the website flow: start checkout, come back from Paystack, see the order paid', async () => {
    vi.stubEnv('DATABASE_URL', url!);
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_flow');
    vi.stubEnv('PAYSTACK_MODE', 'test');
    vi.stubEnv('WEBSITE_URL', 'http://localhost:4321');
    vi.stubEnv('WEBSITE_ORIGINS', 'http://localhost:4321');
    const paystack = vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (String(input).endsWith('/transaction/initialize')) {
        const body = JSON.parse(String(init?.body)) as { reference: string };
        return Response.json({ status: true, data: { authorization_url: 'https://checkout.paystack.com/flow', reference: body.reference } });
      }
      const reference = decodeURIComponent(String(input).split('/').pop()!);
      const order = (await findOrderBy(db, 'reference', reference))!;
      return Response.json({ status: true, data: { status: 'success', reference, amount: order.totalCents, currency: 'ZAR', domain: 'test', id: 8, channel: 'card', paid_at: new Date().toISOString() } });
    });
    vi.stubGlobal('fetch', paystack);
    const website = { origin: 'http://localhost:4321', 'content-type': 'application/json' };

    const started = await startBasket(new Request('http://admin.test/api/checkout/paystack/basket', { method: 'POST', headers: website, body: JSON.stringify(request()) }));
    expect(started.status).toBe(200);
    const { authorizationUrl, reference } = await started.json() as { authorizationUrl: string; reference: string };
    expect(authorizationUrl).toBe('https://checkout.paystack.com/flow');

    const status = await checkoutStatus(new Request(`http://admin.test/api/checkout/status?reference=${reference}`, { headers: { origin: 'http://localhost:4321' } }));
    expect(status.headers.get('access-control-allow-origin')).toBe('http://localhost:4321');
    expect(await status.json()).toMatchObject({ status: 'succeeded', orderNumber: expect.stringMatching(/^TV-/), deliveryStatus: expect.stringMatching(/^(pending|unavailable)$/) });

    const unknown = await checkoutStatus(new Request('http://admin.test/api/checkout/status?reference=TV-NOPE00-000000', { headers: { origin: 'http://localhost:4321' } }));
    expect(unknown.status).toBe(404);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('emails a paid order again, to the buyer or a corrected address, without a new sale email', async () => {
    vi.stubEnv('WEBSITE_URL', 'https://site.test');
    vi.stubEnv('CONTACT_NOTIFY_TO', 'tilana@example.com');
    const { reference } = await startCheckout(db, request(), deps());
    const order = (await findOrderBy(db, 'reference', reference))!;
    expect(await resendOrder(db, order.orderNumber, {}, { send: async () => {}, download: async () => Buffer.from('x') })).toBeNull();

    await applyVerifiedPayment(db, order, success(order));
    await deliverOrder(db, order.id, { send: async () => { throw new Error('SES down'); }, download: async () => Buffer.from('x') });
    const sent: OutgoingEmail[] = [];
    const ok = { send: async (email: OutgoingEmail) => void sent.push(email), download: async () => Buffer.from('%PDF-1.7 %%EOF') };

    expect(await resendOrder(db, order.orderNumber, {}, ok)).toMatchObject({ delivered: true, sentTo: 'anna@example.com' });
    expect(await resendOrder(db, order.orderNumber, { to: ' Anna.New@Example.com ' }, ok)).toMatchObject({ delivered: true, sentTo: 'anna.new@example.com' });
    expect(sent.map(email => email.to[0])).toEqual(['anna@example.com', 'anna.new@example.com']);
    expect(sent.every(email => email.attachments?.length === 2 && !email.subject.includes('New sale'))).toBe(true);
    // The failed first attempt is cleared, and the order keeps the buyer's own address.
    expect(await findOrderBy(db, 'reference', reference)).toMatchObject({ deliveryStatus: 'sent', deliveryError: null, email: 'anna@example.com' });
    vi.unstubAllEnvs();
  });

  it('finds orders by number, email or name, and counts today\'s sales', async () => {
    const { reference } = await startCheckout(db, request({ email: 'findme@example.com', firstName: 'Zelda', lastName: 'Find' }), deps());
    const order = (await findOrderBy(db, 'reference', reference))!;
    await applyVerifiedPayment(db, order, success(order));
    const before = await salesToday(db);

    expect((await findOrders(db, order.orderNumber.toLowerCase())).map(row => row.orderNumber)).toEqual([order.orderNumber]);
    expect((await findOrders(db, 'FINDME@')).map(row => row.orderNumber)).toEqual([order.orderNumber]);
    expect((await findOrders(db, 'zelda find')).map(row => row.orderNumber)).toEqual([order.orderNumber]);
    expect(await findOrders(db, 'x')).toEqual([]);
    expect(await findOrders(db, '100%_')).toEqual([]);
    expect(before.ordersToday).toBeGreaterThan(0);
    expect(before.revenueTodayCents).toBeGreaterThanOrEqual(order.totalCents);
  });

  it('sums paid sales per day and per program for the Sales page', async () => {
    const summary = await salesSummary(db, 30);
    expect(summary.daily).toHaveLength(30);
    expect(summary.daily.at(-1)!.date).toBe(dayRange(1)[0]);
    const paid = summary.recent.filter(order => order.status === 'paid' && order.email.endsWith('@example.com'));
    expect(paid.length).toBeGreaterThan(0);
    expect(summary.totals.revenueCents).toBe(summary.daily.reduce((total, day) => total + day.revenueCents, 0));
    expect(summary.byProgram.find(row => row.label === 'Shop A · Volume 92')?.sold).toBeGreaterThan(0);
    expect(summary.totals.netCents).toBe(summary.totals.revenueCents - summary.totals.feesCents);
    expect(summary.totals.feesCents).toBeGreaterThan(0);
  });
});
