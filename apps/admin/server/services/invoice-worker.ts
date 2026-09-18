import { reconcilePurchaseInvoices } from './invoice-issuance';
import { deliverInvoices } from './invoice-delivery';

/** Billing shares the protected scheduler, not the payment transaction or provider outcome. */
export async function runInvoiceWorker() {
  const enabled = useRuntimeConfig().invoiceBillingEnabled;
  if (String(enabled) !== 'true') return { disabled: true, reconciled: 0, failedOrderIds: [], delivery: { sent: 0, failed: 0 } };
  const result = await reconcilePurchaseInvoices();
  const delivery = await deliverInvoices();
  return { disabled: false, ...result, delivery };
}
