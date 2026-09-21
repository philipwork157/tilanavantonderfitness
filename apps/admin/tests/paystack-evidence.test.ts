import { describe, expect, it } from 'vitest';
import { sanitizePaystackEvent } from '@server/utils/paystack-event-evidence';

const data = { id: 1, reference: 'TVT-1', status: 'success', amount: 10000, currency: 'ZAR', domain: 'test' };
describe('bounded retained payment evidence', () => {
  it.each([null, [], 'secret', 1])('handles non-object data without retaining it: %j', value => {
    expect(sanitizePaystackEvent({ event: 'charge.success', data: value })).toEqual({ event: 'charge.success', data: {}, evidenceRejected: true });
  });
  it.each(['id', 'reference', 'status', 'amount', 'currency', 'domain', 'fees', 'channel', 'paid_at'])('rejects nested/oversized values in %s', key => {
    for (const value of [{ authorization_code: 'SECRET' }, ['SECRET'], 'S'.repeat(10000)]) {
      const retained = sanitizePaystackEvent({ event: 'charge.success', data: { ...data, [key]: value } });
      expect(retained.evidenceRejected).toBe(true);
      expect(retained.data[key]).toBeUndefined();
      expect(JSON.stringify(retained)).not.toContain('SECRET');
      expect(sanitizePaystackEvent(retained)).toEqual(retained);
    }
  });
  it('omits free text and unknown events entirely', () => {
    expect(sanitizePaystackEvent({ event: 'charge.success', data: { ...data, gateway_response: { customer: 'SECRET' } } }))
      .toEqual({ event: 'charge.success', data });
    expect(sanitizePaystackEvent({ event: 'SECRET'.repeat(1000), data })).toEqual({ event: 'unknown', data: {} });
    expect(sanitizePaystackEvent(null)).toEqual({ event: 'unknown', data: {} });
  });
  it.each([-1, 1.5, 2147483648, Infinity, NaN, '10000'])('does not coerce unsafe cents %s', amount => {
    expect(sanitizePaystackEvent({ event: 'charge.success', data: { ...data, amount } }).evidenceRejected).toBe(true);
  });
  it('shapes nested dispute transactions and rejects nested scalar values', () => {
    const dispute = { event: 'charge.dispute.resolve', data: { id: 2, domain: 'test', status: 'resolved', resolution: 'merchant-accepted', transaction: { ...data, customer: 'SECRET' } } };
    expect(JSON.stringify(sanitizePaystackEvent(dispute))).not.toContain('SECRET');
    dispute.data.transaction.currency = { card: 'SECRET' } as unknown as string;
    expect(sanitizePaystackEvent(dispute).evidenceRejected).toBe(true);
  });
});
