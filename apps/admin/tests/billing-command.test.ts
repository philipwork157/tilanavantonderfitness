import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitBillingCommand } from '@app/utils/billing-command';
import { invoiceActionSchema, invoiceReviewSchema, manualInvoiceSchema } from '@tilana/contracts/invoices';

const key = '123e4567-e89b-42d3-a456-426614174000';
beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
});
describe('billing browser retry identity', () => {
  it('reuses its key after a lost response and keeps only digests/keys in storage', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('Lost response')).mockResolvedValue({ invoiceId: 1 });
    const body = { clientName: 'Private customer', reason: 'Private bank receipt detail' };
    await expect(submitBillingCommand('/api/admin/invoices', body, fetch)).rejects.toThrow('Lost response');
    await submitBillingCommand('/api/admin/invoices', body, fetch);
    expect(fetch.mock.calls[0]![1].body.idempotencyKey).toBe(fetch.mock.calls[1]![1].body.idempotencyKey);
    await submitBillingCommand('/api/admin/invoices', body, fetch);
    expect(fetch.mock.calls[2]![1].body.idempotencyKey).not.toBe(fetch.mock.calls[1]![1].body.idempotencyKey);
  });
  it('fails before a mutation if retry storage is unavailable', async () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('Unavailable'); } });
    const fetch = vi.fn();
    await expect(submitBillingCommand('/api/admin/invoices', {}, fetch)).rejects.toThrow('Unavailable');
    expect(fetch).not.toHaveBeenCalled();
  });
});
describe('billing administration contracts', () => {
  const draft = { idempotencyKey: key, reason: 'Agreed coaching fee', clientId: 1, items: [{ description: 'Coaching', quantity: 1, unitPriceCents: 5000 }] };
  it('requires integer cents, nonempty lines and supported aggregate totals', () => {
    expect(manualInvoiceSchema.safeParse(draft).success).toBe(true);
    for (const items of [[], [{ description: 'Coaching', quantity: 1, unitPriceCents: 0 }], [{ description: 'Coaching', quantity: 1, unitPriceCents: 1.1 }], Array.from({ length: 20 }, () => ({ description: 'Coaching', quantity: 100, unitPriceCents: 10_000_000 }))]) {
      expect(manualInvoiceSchema.safeParse({ ...draft, items }).success).toBe(false);
    }
  });
  it('forbids recipient, seller, tax, status and monetary overrides on reissue', () => {
    const input = { idempotencyKey: key, reason: 'Correct billing name', action: 'reissue', clientName: 'Correct Buyer' };
    expect(invoiceActionSchema.safeParse(input).success).toBe(true);
    for (const field of ['clientId', 'clientEmail', 'sellerName', 'taxCents', 'totalCents', 'status']) expect(invoiceActionSchema.safeParse({ ...input, [field]: 'override' }).success).toBe(false);
  });
  it('requires specific receipt evidence and rejects arbitrary actions', () => {
    expect(invoiceActionSchema.safeParse({ idempotencyKey: key, reason: 'Verified receipt', action: 'record-payment', amountCents: 5000, reference: 'bank-123', paidAt: '2026-09-17T10:00:00+02:00' }).success).toBe(true);
    expect(invoiceActionSchema.safeParse({ idempotencyKey: key, reason: 'Verified receipt', action: 'record-payment', amountCents: 5000 }).success).toBe(false);
    expect(invoiceActionSchema.safeParse({ ...draft, action: 'edit-total' }).success).toBe(false);
  });
  it('requires original evidence and a settled payment identity for legacy approval', () => {
    expect(invoiceReviewSchema.safeParse({ idempotencyKey: key, reason: 'Original evidence verified', paymentId: 1, clientName: 'Buyer', clientEmail: 'buyer@example.test', evidence: 'Original checkout evidence reference' }).success).toBe(true);
    expect(invoiceReviewSchema.safeParse({ ...draft, paymentId: 1, evidence: 'Short' }).success).toBe(false);
  });
});
