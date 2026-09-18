import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runInvoiceWorker } from '@server/services/invoice-worker';
const mocks = vi.hoisted(() => ({ reconcilePurchaseInvoices: vi.fn(), deliverInvoices: vi.fn() }));
vi.mock('@server/services/invoice-issuance', () => ({ reconcilePurchaseInvoices: mocks.reconcilePurchaseInvoices }));
vi.mock('@server/services/invoice-delivery', () => ({ deliverInvoices: mocks.deliverInvoices }));
beforeEach(() => {
  mocks.reconcilePurchaseInvoices.mockResolvedValue({ reconciled: 1, failedOrderIds: [] });
  mocks.deliverInvoices.mockResolvedValue({ sent: 1, failed: 0 });
});
describe('invoice worker opt-in', () => {
  it('does no database or email work by default', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ invoiceBillingEnabled: false }));
    expect(await runInvoiceWorker()).toMatchObject({ disabled: true });
    expect(mocks.reconcilePurchaseInvoices).not.toHaveBeenCalled();
    expect(mocks.deliverInvoices).not.toHaveBeenCalled();
  });
  it('runs invoice catch-up and delivery only when enabled', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ invoiceBillingEnabled: true }));
    expect(await runInvoiceWorker()).toMatchObject({ disabled: false, reconciled: 1, delivery: { sent: 1 } });
  });
});
