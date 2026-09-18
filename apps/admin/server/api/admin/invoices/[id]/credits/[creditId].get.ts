import { requireAdmin } from '@server/utils/admin-auth';
import { requireRouteDatabaseId } from '@server/utils/route-validation';
import { getInvoiceDocument } from '@server/services/invoice-records';
import { sendInvoicePdf } from '@server/utils/invoice-response';

/** Administrative downloads still validate the credit's invoice association. */
export default defineEventHandler(async event => {
  await requireAdmin(event);
  const id = requireRouteDatabaseId(event, 'invoice');
  const creditId = requireRouteDatabaseId(event, 'credit note', 'creditId');
  return sendInvoicePdf(event, await getInvoiceDocument(id, undefined, creditId));
});
