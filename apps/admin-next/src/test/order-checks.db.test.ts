/**
 * Database tests for the background order checks, refunds, disputes and the
 * "never delete a sold program" rule. Need TEST_DATABASE_URL. Paystack and
 * email are simulated; nothing leaves this machine.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { eq, inArray, like } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase, orders, programs, volumes, type Database, type Order, type Volume } from '@tilana/db';
import type { BasketCheckoutRequest } from '@tilana/contracts/checkout';
import { GET as cron } from '@/app/api/cron/order-checks/route';
import { POST as webhook } from '@/app/api/webhooks/paystack/route';
import { runOrderChecks, type OrderCheckDependencies } from '@/server/services/order-checks';
import { applyVerifiedPayment, findOrderBy, startCheckout } from '@/server/services/orders';
import { isProgramInAnyOrder } from '@/server/services/programs';
import { requestRefund } from '@/server/services/refunds';
import type { OutgoingEmail } from '@/server/utils/email-routing';
import { PaystackError, type VerifiedPayment } from '@/server/utils/paystack';

const url = process.env.TEST_DATABASE_URL;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const pdf = (n: number) => ({ filePath: `programs/${n}/v1-abc.pdf`, fileName: `P${n}.pdf`, fileSizeBytes: 10, fileSha256: 'c'.repeat(64), fileVersion: 1, fileUploadedAt: new Date() });

describe.skipIf(!url)('order checks, refunds and disputes (database)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let volume: Volume;
  let sent: OutgoingEmail[];
  const later = (ms: number) => new Date(Date.now() + ms);
  const mail = { send: async (email: OutgoingEmail) => void sent.push(email), download: async () => Buffer.from('%PDF-1.7 %%EOF') };

  async function newOrder(): Promise<Order> {
    const input: BasketCheckoutRequest = {
      idempotencyKey: randomUUID(), items: [{ volumeSlug: 'test-chk-a', expectedPriceCents: 39_900 }],
      firstName: 'Cara', lastName: 'Check', email: `cara-${randomUUID().slice(0, 8)}@example.com`, phone: '', consent: true, website: '', turnstileToken: '',
    };
    const { reference } = await startCheckout(db, input, { mode: 'test', websiteUrl: 'https://site.test', initialize: async () => ({ authorizationUrl: 'https://checkout.paystack.com/x' }) });
    return (await findOrderBy(db, 'reference', reference))!;
  }
  const answer = (order: Order, status: string, overrides: Partial<VerifiedPayment> = {}): VerifiedPayment => ({
    status, reference: order.reference, amountCents: order.totalCents, requestedAmountCents: order.totalCents, feeCents: 1_257, currency: 'ZAR', mode: 'test', transactionId: '77', channel: 'card', paidAt: new Date(), ...overrides,
  });
  /** Paystack, simulated per order; other orders in the test database are left alone. */
  function paystack(answers: Map<string, VerifiedPayment | 'not-found'>, refunds: Record<string, string> = {}): OrderCheckDependencies {
    return {
      verify: async (reference) => {
        const found = answers.get(reference);
        if (found === 'not-found') throw new PaystackError('Transaction reference not found', { notFound: true });
        if (!found) throw new PaystackError('Paystack could not be reached.');
        return found;
      },
      refund: async (id) => ({ id, status: refunds[id] ?? 'pending', amountCents: 39_900 }),
      delivery: mail,
    };
  }
  const reload = async (order: Order) => (await findOrderBy(db, 'reference', order.reference))!;

  beforeAll(async () => {
    ({ db, close } = createDatabase(url!, { max: 1 }));
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../../../packages/db/migrations', import.meta.url)) });
    await db.delete(orders).where(like(orders.email, 'cara-%'));
    await db.delete(programs).where(like(programs.slug, 'test-chk-%'));
    await db.delete(volumes).where(inArray(volumes.number, [93]));
    [volume] = await db.insert(volumes).values({ number: 93, name: 'Volume 93', isActive: true }).returning() as [Volume];
    await db.insert(programs).values({ volumeId: volume.id, slug: 'test-chk-a', name: 'Check A', priceCents: 39_900, ...pdf(1) });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await db.delete(orders).where(like(orders.email, 'cara-%'));
    await db.delete(programs).where(like(programs.slug, 'test-chk-%'));
    await db.delete(volumes).where(eq(volumes.id, volume.id));
    await close?.();
  });

  it('finds a payment the website never confirmed, emails the PDFs and tells Tilana once', async () => {
    vi.stubEnv('WEBSITE_URL', 'https://site.test');
    vi.stubEnv('CONTACT_NOTIFY_TO', 'tilana@example.com');
    sent = [];
    const order = await newOrder();
    const deps = paystack(new Map([[order.reference, answer(order, 'success')]]));

    await runOrderChecks(db, later(MINUTE), deps);
    expect((await reload(order)).status).toBe('pending'); // too soon: the buyer may still be paying

    // Other test orders may be retried in the same run; look only at this order's emails.
    const mine = () => sent.filter(email => email.to[0] === order.email || email.subject.includes(order.orderNumber));
    await runOrderChecks(db, later(5 * MINUTE), deps);
    expect(await reload(order)).toMatchObject({ status: 'paid', deliveryStatus: 'sent', deliveryAttempts: 1 });
    expect(mine().map(email => email.to[0])).toEqual([order.email, 'tilana@example.com']);

    await runOrderChecks(db, later(HOUR), deps);
    expect(mine()).toHaveLength(2);
  });

  it('only closes unpaid orders after Paystack says so and the buyer had time', async () => {
    const young = await newOrder();
    const unknown = await newOrder();
    const deps = paystack(new Map<string, VerifiedPayment | 'not-found'>([[young.reference, answer(young, 'abandoned')], [unknown.reference, 'not-found']]));

    await runOrderChecks(db, later(10 * MINUTE), deps);
    expect((await reload(young)).status).toBe('pending');
    expect((await reload(unknown)).status).toBe('pending');

    await runOrderChecks(db, later(2 * HOUR), deps);
    expect((await reload(young)).status).toBe('abandoned');
    expect((await reload(unknown)).status).toBe('pending');

    await runOrderChecks(db, later(25 * HOUR), deps);
    expect((await reload(unknown)).status).toBe('abandoned');

    // A late success still wins over "abandoned".
    expect((await applyVerifiedPayment(db, await reload(young), answer(young, 'success'))).justPaid).toBe(true);
  });

  it('flags a payment that does not match instead of marking it paid', async () => {
    vi.stubEnv('CONTACT_NOTIFY_TO', 'tilana@example.com');
    sent = [];
    const order = await newOrder();
    const deps = paystack(new Map([[order.reference, answer(order, 'success', { amountCents: 100 })]]));
    await runOrderChecks(db, later(5 * MINUTE), deps);
    await runOrderChecks(db, later(HOUR), deps);
    const flagged = await reload(order);
    expect(flagged.status).toBe('pending');
    expect(flagged.reviewNote).toContain('does not match');
    expect(sent.filter(email => email.subject.includes('Needs your attention') && email.subject.includes(order.orderNumber))).toHaveLength(1);

    // "Mark as checked": no new flag, check or email for this payment afterwards.
    await db.update(orders).set({ reviewNote: null, reviewedAt: later(2 * HOUR) }).where(eq(orders.id, order.id));
    await runOrderChecks(db, later(4 * HOUR), deps);
    await applyVerifiedPayment(db, await reload(order), answer(order, 'success', { amountCents: 100 }));
    expect((await reload(order)).reviewNote).toBeNull();
    expect(sent.filter(email => email.subject.includes(order.orderNumber))).toHaveLength(1);
  });

  it('retries PDF emails on a schedule, then tells Tilana it gave up', async () => {
    vi.stubEnv('WEBSITE_URL', 'https://site.test');
    vi.stubEnv('CONTACT_NOTIFY_TO', 'tilana@example.com');
    sent = [];
    const order = await newOrder();
    await applyVerifiedPayment(db, order, answer(order, 'success'));
    const failing = { ...paystack(new Map()), delivery: { send: async (email: OutgoingEmail) => { if (email.to[0] === order.email) throw new Error('SES down'); sent.push(email); }, download: mail.download } };

    await runOrderChecks(db, later(5 * MINUTE), failing);
    expect((await reload(order)).deliveryAttempts).toBe(0); // first retry waits 10 minutes (the first attempt runs at payment)
    for (const wait of [11 * MINUTE, 31 * MINUTE, 3 * HOUR, 13 * HOUR]) await runOrderChecks(db, later(wait), failing);
    expect(await reload(order)).toMatchObject({ deliveryStatus: 'failed', deliveryAttempts: 4 });
    const mine = sent.filter(email => email.subject.includes(order.orderNumber));
    expect(mine.filter(email => email.subject.includes('New sale'))).toHaveLength(1);
    expect(mine.filter(email => email.subject.includes('could not be emailed'))).toHaveLength(1);

    await runOrderChecks(db, later(48 * HOUR), failing);
    expect((await reload(order)).deliveryAttempts).toBe(4);
  });

  it('refunds through Paystack, confirms later and tells the buyer; a refunded order never turns paid again', async () => {
    vi.stubEnv('CONTACT_NOTIFY_TO', '');
    sent = [];
    const order = await newOrder();
    await applyVerifiedPayment(db, order, answer(order, 'success'));
    const create = vi.fn(async () => ({ id: 'rf_1', status: 'pending', amountCents: 39_900 }));

    await expect(requestRefund(db, 'TV-NOPE22', 'x', { create, send: mail.send })).rejects.toThrow('Order not found');
    const pending = await requestRefund(db, order.orderNumber, 'Bought by mistake', { create, send: mail.send });
    expect(pending).toMatchObject({ status: 'paid', refundStatus: 'pending', paystackRefundId: 'rf_1', refundReason: 'Bought by mistake' });
    expect(create).toHaveBeenCalledWith({ transactionId: '77', reason: 'Bought by mistake' });
    await expect(requestRefund(db, order.orderNumber, 'again', { create, send: mail.send })).rejects.toThrow('already in progress');

    await runOrderChecks(db, later(20 * MINUTE), paystack(new Map(), { rf_1: 'processed' }));
    expect(await reload(order)).toMatchObject({ status: 'refunded', refundStatus: 'processed' });
    await vi.waitFor(() => expect(sent.some(email => email.to[0] === order.email && email.subject.includes('refund'))).toBe(true));

    const again = await applyVerifiedPayment(db, await reload(order), answer(order, 'success'));
    expect(again).toMatchObject({ status: 'refunded', justPaid: false });
    const [program] = await db.select().from(programs).where(eq(programs.slug, 'test-chk-a'));
    expect(await isProgramInAnyOrder(db, program!.id)).toBe(true);
  });

  it('handles signed refund and dispute webhooks, including refunds made in the Paystack dashboard', async () => {
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_hooks');
    vi.stubEnv('PAYSTACK_MODE', 'test');
    vi.stubEnv('DATABASE_URL', url!);
    vi.stubEnv('CONTACT_NOTIFY_TO', '');
    const order = await newOrder();
    await applyVerifiedPayment(db, order, answer(order, 'success'));
    const post = (body: object) => {
      const raw = JSON.stringify(body);
      return webhook(new Request('http://admin.test/api/webhooks/paystack', { method: 'POST', body: raw, headers: { 'x-paystack-signature': createHmac('sha512', 'sk_test_hooks').update(raw).digest('hex') } }));
    };

    expect((await post({ event: 'charge.dispute.create', data: { transaction: { reference: order.reference } } })).status).toBe(200);
    expect((await reload(order)).reviewNote).toContain('dispute');

    expect((await post({ event: 'refund.processed', data: { transaction_reference: order.reference, status: 'processed' } })).status).toBe(200);
    expect(await reload(order)).toMatchObject({ status: 'refunded', refundStatus: 'processed', refundReason: 'Refunded in Paystack' });
  });

  it('records Paystack\'s fee, accepts a buyer-paid fee, and fills in missing fees later', async () => {
    const order = await newOrder();
    // The buyer paid Paystack's fee on top: charged more than asked, still the right payment.
    const applied = await applyVerifiedPayment(db, order, answer(order, 'success', { amountCents: order.totalCents + 1_300, feeCents: 1_300 }));
    expect(applied.justPaid).toBe(true);
    expect((await reload(order)).feeCents).toBe(1_300);

    const older = await newOrder();
    await applyVerifiedPayment(db, older, answer(older, 'success', { feeCents: null }));
    expect((await reload(older)).feeCents).toBeNull();
    await runOrderChecks(db, later(2 * HOUR), paystack(new Map([[older.reference, answer(older, 'success', { feeCents: 1_257 })]])));
    expect((await reload(older)).feeCents).toBe(1_257);

    // Asking for less than the order is never accepted.
    const short = await newOrder();
    expect((await applyVerifiedPayment(db, short, answer(short, 'success', { requestedAmountCents: 100, amountCents: 100 }))).justPaid).toBe(false);
  });

  it('runs from the scheduled URL only with the right secret', async () => {
    vi.stubEnv('DATABASE_URL', url!);
    vi.stubEnv('CRON_SECRET', '');
    const call = (auth?: string) => cron(new Request('http://admin.test/api/cron/order-checks', { headers: auth ? { authorization: auth } : {} }));
    expect((await call('Bearer x')).status).toBe(404);
    vi.stubEnv('CRON_SECRET', 'cron-secret-1');
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong-secret')).status).toBe(401);
    vi.stubEnv('PAYSTACK_SECRET_KEY', '');
    const ok = await call('Bearer cron-secret-1');
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true });
  });
});
