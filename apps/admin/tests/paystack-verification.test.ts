import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyPaystackCheckout } from '@server/services/paystack';

const mocks = vi.hoisted(() => ({ getDatabase: vi.fn() }));
vi.mock('@server/utils/database', () => mocks);
vi.mock('@server/utils/paystack-configuration', async (importOriginal) => ({
  ...await importOriginal<typeof import('@server/utils/paystack-configuration')>(),
  assertPaystackDatabaseEnvironment: vi.fn(),
}));

const reference = 'TVT-verification-boundary-test';
const evidence = {
  reference,
  amount: 10000,
  currency: 'ZAR',
  domain: 'test',
  status: 'failed',
};

/** Keep these boundary tests independent of PostgreSQL and external services. */
function arrangePayment(status = 'pending') {
  const transaction = vi.fn();
  mocks.getDatabase.mockReturnValue({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{
      id: 1, status, amountCents: 10000, currency: 'ZAR', environment: 'test',
    }] }) }) }),
    transaction,
  });
  return transaction;
}

beforeEach(() => {
  vi.stubGlobal('useRuntimeConfig', () => ({ paystackSecretKey: 'sk_test_unit_fixture', paystackEnvironment: 'test' }));
  vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(input.statusMessage), input));
});

describe('Paystack verification evidence boundary', () => {
  it.each([
    ['unsuccessful API call', { status: false, message: 'Unavailable', data: evidence }],
    ['missing body', null],
    ['missing transaction', { status: true, message: 'Verified' }],
    ['different reference', { status: true, message: 'Verified', data: { ...evidence, reference: 'another-payment' } }],
    ['different amount', { status: true, message: 'Verified', data: { ...evidence, amount: 1 } }],
    ['different currency', { status: true, message: 'Verified', data: { ...evidence, currency: 'USD' } }],
    ['different environment', { status: true, message: 'Verified', data: { ...evidence, domain: 'live' } }],
    ['missing environment', { status: true, message: 'Verified', data: { ...evidence, domain: undefined } }],
    ['string amount', { status: true, message: 'Verified', data: { ...evidence, amount: '10000' } }],
    ['missing transaction status', { status: true, message: 'Verified', data: { ...evidence, status: undefined } }],
    ['internal checkout claim marker', { status: true, message: 'Verified', data: { ...evidence, status: 'initialization_reserved' } }],
    ['unsupported transaction status', { status: true, message: 'Verified', data: { ...evidence, status: 'constructor' } }],
    ['success for another reference', { status: true, message: 'Verified', data: { ...evidence, status: 'success', reference: 'another-payment' } }],
  ])('rejects %s without opening a write transaction', async (_label, response) => {
    const transaction = arrangePayment();
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(response));

    await expect(verifyPaystackCheckout(reference)).rejects.toMatchObject({ statusCode: 502 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each(['succeeded', 'partially_refunded', 'refunded', 'reversed', 'failed', 'abandoned'])(
    'does not contact the provider for an already %s payment', async (status) => {
      const transaction = arrangePayment(status);
      const fetch = vi.fn();
      vi.stubGlobal('$fetch', fetch);
      await verifyPaystackCheckout(reference);
      expect(fetch).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('leaves the payment untouched when the provider request fails', async () => {
    const transaction = arrangePayment();
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('Provider unavailable')));
    await expect(verifyPaystackCheckout(reference)).rejects.toThrow('Provider unavailable');
    expect(transaction).not.toHaveBeenCalled();
  });
});
