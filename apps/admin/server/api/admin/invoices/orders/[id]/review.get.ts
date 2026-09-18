import { inspectInvoicePurchase } from '@server/services/invoice-inspection';
import { requireAdmin } from '@server/utils/admin-auth';
import { requireRouteDatabaseId } from '@server/utils/route-validation';

/** Inspect server-held originals; current editable profiles are not historical purchase proof. */
export default defineEventHandler(async event => {
  await requireAdmin(event);
  return inspectInvoicePurchase(requireRouteDatabaseId(event, 'order'));
});
