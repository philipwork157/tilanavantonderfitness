import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizePaymentRecovery } from '@server/utils/payment-recovery-auth';
import { recoveryDelay } from '@server/services/payment-recovery';
import { adminPaymentRecoveryRequestSchema, paystackRecoveryRefundSchema, paystackRecoveryDisputeSchema } from '@tilana/contracts/payments';

const token = 'a'.repeat(40);
beforeEach(() => {
  vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) => Object.assign(new Error(input.statusMessage), input));
  vi.stubGlobal('useRuntimeConfig', () => ({ paystackRecoveryEnabled: true, paystackRecoveryToken: token, paystackRecoveryAlertTo: 'ops@example.test' }));
});
describe('payment recovery security and policy', () => {
  it('accepts only the dedicated configured bearer token', () => {
    expect(() => authorizePaymentRecovery(`Bearer ${token}`)).not.toThrow();
  });
  it.each([undefined, '', 'Bearer short', `Basic ${token}`, `Bearer ${'b'.repeat(40)}`])('rejects invalid authorization %s', (header) => {
    expect(() => authorizePaymentRecovery(header)).toThrow();
  });
  it.each([
    { paystackRecoveryEnabled: false }, { paystackRecoveryToken: 'short' }, { paystackRecoveryAlertTo: '' },
  ])('fails closed on incomplete scheduler configuration %j', (override) => {
    vi.stubGlobal('useRuntimeConfig', () => ({ paystackRecoveryEnabled: true, paystackRecoveryToken: token, paystackRecoveryAlertTo: 'ops@example.test', ...override }));
    expect(() => authorizePaymentRecovery(`Bearer ${token}`)).toThrow();
  });
  it('backs off exponentially and caps persistent retries at six hours', () => {
    expect(recoveryDelay(1)).toBe(60_000);
    expect(recoveryDelay(2)).toBe(120_000);
    expect(recoveryDelay(100)).toBe(6 * 60 * 60_000);
  });
  it.each([
    { action: 'reconcile', paymentId: 0 }, { action: 'replay', eventId: '1' },
    { action: 'replay', eventId: 1, payload: { event: 'charge.success' } }, { action: 'charge', paymentId: 1 },
  ])('rejects unsafe operator input %j', (input) => expect(adminPaymentRecoveryRequestSchema.safeParse(input).success).toBe(false));
  it('accepts internal IDs and rejects malformed provider amounts', () => {
    expect(adminPaymentRecoveryRequestSchema.parse({ action: 'reconcile', paymentId: 1 })).toEqual({ action: 'reconcile', paymentId: 1 });
    expect(paystackRecoveryRefundSchema.safeParse({ id: 1, transaction: 1, domain: 'test', currency: 'ZAR', amount: '100', status: 'processed' }).success).toBe(false);
    expect(paystackRecoveryDisputeSchema.safeParse({ id: 1, domain: 'test', status: 'resolved', refund_amount: -1 }).success).toBe(false);
  });
});
