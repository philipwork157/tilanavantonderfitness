import { requireAdmin } from '@server/utils/admin-auth';
import { requireRouteDatabaseId } from '@server/utils/route-validation';
import { getInvoiceDocument } from '@server/services/invoice-records';
import { sendInvoicePdf } from '@server/utils/invoice-response';

/** Audit originals and reissues independently, without replacing the original PDF. */
export default defineEventHandler(async event => {
  await requireAdmin(event);
  const id = requireRouteDatabaseId(event, 'invoice');
  const editionId = requireRouteDatabaseId(event, 'edition', 'editionId');
  return sendInvoicePdf(event, await getInvoiceDocument(id, undefined, undefined, editionId));
});
