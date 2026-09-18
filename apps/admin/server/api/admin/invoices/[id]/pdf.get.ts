import { requireAdmin } from '@server/utils/admin-auth';
import { requireRouteDatabaseId } from '@server/utils/route-validation';
import { getInvoiceDocument } from '@server/services/invoice-records';
import { sendInvoicePdf } from '@server/utils/invoice-response';

/** Require administrator identity before reading the immutable invoice. */
export default defineEventHandler(async event => {
  await requireAdmin(event);
  const id = requireRouteDatabaseId(event, 'invoice');
  return sendInvoicePdf(event, await getInvoiceDocument(id));
});
