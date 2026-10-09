import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupAttachments } from '@/server/services/order-delivery';
import { newOrderNumber, newReference } from '@/server/services/orders';
import { saleNotificationEmail } from '@/server/services/sale-emails';
import { createRefund, fetchRefund, initializePayment, isValidPaystackSignature, PaystackError, paystackSettings, verifyPayment } from '@/server/utils/paystack';

afterEach(() => vi.unstubAllEnvs());

describe('Paystack settings', () => {
  it('only works when the key and the mode agree', () => {
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_abc');
    vi.stubEnv('PAYSTACK_MODE', 'test');
    expect(paystackSettings()).toEqual({ secretKey: 'sk_test_abc', mode: 'test' });
    vi.stubEnv('PAYSTACK_MODE', 'live');
    expect(() => paystackSettings()).toThrow('not available');
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_live_abc');
    expect(paystackSettings().mode).toBe('live');
    vi.stubEnv('PAYSTACK_SECRET_KEY', '');
    expect(() => paystackSettings()).toThrow('not available');
  });
});

describe('Paystack API', () => {
  it('starts a payment in rand cents and checks the answer', async () => {
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_abc');
    vi.stubEnv('PAYSTACK_MODE', 'test');
    const fetcher = vi.fn(async () => Response.json({ status: true, data: { authorization_url: 'https://checkout.paystack.com/x', reference: 'TV-ABC123-0011' } }));
    const result = await initializePayment({
      email: 'anna@example.com', amountCents: 39_900, reference: 'TV-ABC123-0011',
      callbackUrl: 'https://site.test/checkout/complete?reference=TV-ABC123-0011', cancelUrl: 'https://site.test/checkout', metadata: { order_number: 'TV-ABC123' },
    }, fetcher as unknown as typeof fetch);
    expect(result.authorizationUrl).toBe('https://checkout.paystack.com/x');
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.paystack.co/transaction/initialize');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sk_test_abc');
    expect(JSON.parse(String(init.body))).toMatchObject({ amount: 39_900, currency: 'ZAR', email: 'anna@example.com', metadata: { cancel_action: 'https://site.test/checkout' } });
  });

  it('reads the verified payment', async () => {
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_abc');
    vi.stubEnv('PAYSTACK_MODE', 'test');
    const fetcher = vi.fn(async () => Response.json({ status: true, data: { status: 'success', reference: 'R-1234567890', amount: 41_200, requested_amount: 39_900, fees: 1_300, currency: 'ZAR', domain: 'test', id: 42, channel: 'card', paid_at: '2026-10-08T10:00:00.000Z' } }));
    expect(await verifyPayment('R-1234567890', fetcher as unknown as typeof fetch)).toMatchObject({
      status: 'success', amountCents: 41_200, requestedAmountCents: 39_900, feeCents: 1_300, currency: 'ZAR', mode: 'test', transactionId: '42', channel: 'card',
    });
    const failing = vi.fn(async () => Response.json({ status: false, message: 'Transaction reference not found' }, { status: 400 }));
    await expect(verifyPayment('R-1234567890', failing as unknown as typeof fetch)).rejects.toThrow('Transaction reference not found');
  });

  it('shows the order in the Paystack dashboard and tells "never paid" apart from "unreachable"', async () => {
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_abc');
    vi.stubEnv('PAYSTACK_MODE', 'test');
    const fetcher = vi.fn(async () => Response.json({ status: true, data: { authorization_url: 'https://checkout.paystack.com/x', reference: 'TV-ABC123-0011' } }));
    await initializePayment({
      email: 'anna@example.com', amountCents: 39_900, reference: 'TV-ABC123-0011', callbackUrl: 'https://site.test/c', cancelUrl: 'https://site.test/checkout',
      metadata: { order_number: 'TV-ABC123' }, details: [{ label: 'Order number', value: 'TV-ABC123' }],
    }, fetcher as unknown as typeof fetch);
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).metadata.custom_fields).toEqual([{ display_name: 'Order number', variable_name: 'order_number', value: 'TV-ABC123' }]);

    const missing = vi.fn(async () => Response.json({ status: false, message: 'Transaction reference not found' }, { status: 400 }));
    await expect(verifyPayment('R-1234567890', missing as unknown as typeof fetch)).rejects.toMatchObject({ notFound: true });
    const down = vi.fn(async () => { throw new Error('ECONNRESET'); });
    const error = await verifyPayment('R-1234567890', down as unknown as typeof fetch).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PaystackError);
    expect((error as PaystackError).notFound).toBe(false);
  });

  it('starts and reads refunds', async () => {
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test_abc');
    vi.stubEnv('PAYSTACK_MODE', 'test');
    const fetcher = vi.fn(async () => Response.json({ status: true, data: { id: 31, status: 'pending', amount: 39_900 } }));
    expect(await createRefund({ transactionId: '77', reason: 'Wrong program' }, fetcher as unknown as typeof fetch)).toEqual({ id: '31', status: 'pending', amountCents: 39_900 });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.paystack.co/refund');
    expect(JSON.parse(String(init.body))).toEqual({ transaction: '77', merchant_note: 'Wrong program' });
    const processed = vi.fn(async () => Response.json({ status: true, data: { id: 31, status: 'processed', amount: 39_900 } }));
    expect((await fetchRefund('31', processed as unknown as typeof fetch)).status).toBe('processed');
  });

  it('accepts only webhooks signed with the secret key', () => {
    const body = JSON.stringify({ event: 'charge.success', data: { reference: 'R-1234567890' } });
    const good = createHmac('sha512', 'sk_test_abc').update(body).digest('hex');
    expect(isValidPaystackSignature(body, good, 'sk_test_abc')).toBe(true);
    expect(isValidPaystackSignature(body, good, 'sk_test_other')).toBe(false);
    expect(isValidPaystackSignature(`${body} `, good, 'sk_test_abc')).toBe(false);
    expect(isValidPaystackSignature(body, null, 'sk_test_abc')).toBe(false);
    expect(isValidPaystackSignature(body, 'abc', 'sk_test_abc')).toBe(false);
  });
});

describe('orders', () => {
  it('makes readable order numbers and references the website accepts', () => {
    const number = newOrderNumber();
    expect(number).toMatch(/^TV-[A-HJ-NP-Z2-9]{6}$/);
    expect(newReference(number)).toMatch(/^[A-Za-z0-9.=-]{10,160}$/);
  });

  it('splits large deliveries over several emails', () => {
    const file = (mb: number) => ({ attachment: { fileName: 'a.pdf', contentType: 'application/pdf', data: new Uint8Array(mb * 1024 * 1024) } });
    expect(groupAttachments([file(5), file(5), file(5)]).map(group => group.length)).toEqual([3]);
    expect(groupAttachments([file(12), file(12), file(3)]).map(group => group.length)).toEqual([1, 2]);
  });

  it('tells Tilana about the sale, and loudly when the PDFs did not go out', () => {
    const sale = { orderNumber: 'TV-ABC123', buyerName: 'Anna <b>', buyerEmail: 'anna@example.com', items: [{ label: 'Beginner · Volume 1', priceCents: 39_900 }], totalCents: 39_900, delivered: true, testMode: true, adminUrl: null };
    const email = saleNotificationEmail('tilana@example.com', sale);
    expect(email.subject).toBe('[Test payment] New sale: R399 · TV-ABC123');
    expect(email.html).toContain('Anna &lt;b&gt;');
    expect(saleNotificationEmail('tilana@example.com', { ...sale, delivered: false }).text).toContain('could NOT be emailed');
  });
});
