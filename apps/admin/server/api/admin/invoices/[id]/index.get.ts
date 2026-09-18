import { inspectInvoice } from '@server/services/invoice-inspection';
import { requireAdmin } from '@server/utils/admin-auth';
import { requireRouteDatabaseId } from '@server/utils/route-validation';

/** Only administrators may inspect customer billing corrections and bank receipt evidence. */
export default defineEventHandler(async event => {
  await requireAdmin(event);
  return inspectInvoice(requireRouteDatabaseId(event, 'invoice'));
});
