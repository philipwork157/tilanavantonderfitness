import { describe, expect, it, vi } from 'vitest';
import { processPaystackDispute } from '@server/services/paystack-disputes';

/** Rejected or deferred identity must not even reach dispute or financial writes. */
describe('dispute transaction identity guard', () => {
  const evidence = {
    id: 'dispute-1', domain: 'test', status: 'resolved', resolution: 'merchant-accepted',
    transaction: { id: 123, reference: 'TVT-test', domain: 'test', amount: 10000, currency: 'ZAR' },
  };
  it.each([
    { status: 'succeeded' as const, providerTransactionId: '999', expected: 'failed' },
    { status: 'succeeded' as const, providerTransactionId: null, expected: 'failed' },
    { status: 'pending' as const, providerTransactionId: null, expected: 'received' },
    { status: 'pending' as const, providerTransactionId: '999', expected: 'failed' },
  ])('returns $expected for $status with identity $providerTransactionId', async ({ status, providerTransactionId, expected }) => {
    const transaction = { select: vi.fn(), insert: vi.fn(), update: vi.fn() };
    const result = await processPaystackDispute(transaction as unknown as Parameters<typeof processPaystackDispute>[0], evidence, {
      id: 1, orderId: 1, amountCents: 10000, currency: 'ZAR', environment: 'test', status, providerTransactionId,
    });
    expect(result.status).toBe(expected);
    expect(result).not.toHaveProperty('revoke', true);
    for (const operation of Object.values(transaction)) expect(operation).not.toHaveBeenCalled();
  });
});
