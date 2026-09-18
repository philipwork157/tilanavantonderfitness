import { authorizePaymentRecovery } from '@server/utils/payment-recovery-auth';
import { runPaymentRecovery } from '@server/services/payment-recovery';
import { runInvoiceWorker } from '@server/services/invoice-worker';
import { runCustomerNotificationWorker } from '@server/services/customer-notifications';

/** External scheduler wakes sleeping Fly machines; no browser session or public provider payload is accepted. */
export default defineEventHandler(async (event) => {
  authorizePaymentRecovery(getHeader(event, 'authorization'), useRuntimeConfig(event));
  setHeader(event, 'cache-control', 'no-store');
  const result = await runPaymentRecovery();
  const billing = await runInvoiceWorker();
  const access = await runCustomerNotificationWorker();
  if (access.failed) throw createError({ statusCode: 503, statusMessage: 'Customer access delivery requires attention.' });
  if (billing.failedOrderIds.length || billing.delivery.failed) throw createError({ statusCode: 503, statusMessage: 'Invoice processing requires attention.' });
  if (result.alerts.failed > 0) throw createError({ statusCode: 503, statusMessage: 'Recovery alert delivery requires attention.' });
  return { ...result, billing, access };
});
