import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatBillingDate, formatInvoiceMoney, invoiceListQuerySchema, invoiceRetrySchema } from '@tilana/contracts/invoices';
import { validateInvoicePurchase, INVOICE_SELLER } from '@server/services/invoice-policy';
import { getInvoiceRecipient } from '@server/services/invoice-delivery';

const order = { currency: 'ZAR', subtotalCents: 39900, discountCents: 0, taxCents: 0, totalCents: 39900 };
const payment = { currency: 'ZAR', amountCents: 39900 };
const items = [{ quantity: 1, unitPriceCents: 39900, lineTotalCents: 39900 }];
beforeEach(() => {
  vi.stubGlobal('createError', (input: object) => Object.assign(new Error('Invalid configuration'), input));
  vi.stubGlobal('useRuntimeConfig', () => ({ paystackEnvironment: 'test', invoiceDevelopmentRecipient: 'safe@example.test' }));
});
describe('non-VAT invoice rules', () => {
  it('uses the South African calendar date across UTC midnight boundaries', () => {
    expect(formatBillingDate(new Date('2026-09-17T23:00:00Z'))).toBe('2026-09-18');
    expect(() => formatBillingDate(new Date('invalid'))).toThrow();
  });
  it('uses the confirmed seller identity and address', () => {
    expect(INVOICE_SELLER.sellerName).toBe('Tilana van Tonder');
    expect(INVOICE_SELLER.sellerAddress).toContain('Ternberry Village, Cleveland 31');
    expect(INVOICE_SELLER.sellerTaxNumber).toBeNull();
  });
  it('accepts valid immutable line snapshots', () => expect(() => validateInvoicePurchase(order, payment, items)).not.toThrow());
  it.each([
    { ...order, taxCents: 100 }, { ...order, totalCents: 39800 },
    { ...order, subtotalCents: 40000 }, { ...order, currency: 'USD' },
    { ...order, totalCents: Number.NaN },
  ])('rejects inconsistent purchase totals %j', value => expect(() => validateInvoicePurchase(value, payment, items)).toThrow());
  it('rejects a mismatched payment amount or currency', () => {
    expect(() => validateInvoicePurchase(order, { ...payment, amountCents: 1 }, items)).toThrow();
    expect(() => validateInvoicePurchase(order, { ...payment, currency: 'USD' }, items)).toThrow();
  });
  it.each([[], [{ quantity: 0, unitPriceCents: 39900, lineTotalCents: 39900 }], [{ quantity: 1, unitPriceCents: 1, lineTotalCents: 39900 }]])('rejects broken lines %j', value => expect(() => validateInvoicePurchase(order, payment, value)).toThrow());
  it('formats integer cents without floating point rounding', () => {
    expect(formatInvoiceMoney(39900)).toBe('ZAR 399.00');
    expect(formatInvoiceMoney(1)).toBe('ZAR 0.01');
    expect(() => formatInvoiceMoney(1.5)).toThrow();
    expect(() => formatInvoiceMoney(-1)).toThrow();
  });
  it('requires bounded cursor IDs and rejects supplied recipients', () => {
    expect(invoiceListQuerySchema.parse({ before: '12' })).toEqual({ before: 12 });
    expect(invoiceListQuerySchema.safeParse({ before: '-1' }).success).toBe(false);
    expect(invoiceRetrySchema.safeParse({ action: 'retry-delivery', email: 'attacker@example.test' }).success).toBe(false);
  });
  it('redirects test invoices to the required safe inbox', () => expect(getInvoiceRecipient('buyer@example.test')).toBe('safe@example.test'));
  it('fails closed when the test safe inbox is missing', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ paystackEnvironment: 'test' }));
    expect(() => getInvoiceRecipient('buyer@example.test')).toThrow();
  });
  it('never redirects live invoices to a development inbox', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ paystackEnvironment: 'live', invoiceDevelopmentRecipient: 'safe@example.test' }));
    expect(getInvoiceRecipient('buyer@example.test')).toBe('buyer@example.test');
  });
  it('rejects a live setting on the known development deployment', () => {
    vi.stubEnv('FLY_APP_NAME', 'tilanavantonder-admin-dev');
    vi.stubGlobal('useRuntimeConfig', () => ({ paystackEnvironment: 'live' }));
    expect(() => getInvoiceRecipient('buyer@example.test')).toThrow();
  });
});
