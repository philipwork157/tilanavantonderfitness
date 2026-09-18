import { invoiceRetrySchema } from '@tilana/contracts/invoices';
import { requireAdminMutation } from '@server/utils/admin-mutation';
import { readZodBody, requireRouteDatabaseId } from '@server/utils/route-validation';
import { retryInvoiceDelivery } from '@server/services/invoice-records';

/** Same-origin admins may expedite failed delivery, never edit a paid invoice. */
export default defineEventHandler(async event => {
  await requireAdminMutation(event);
  const id = requireRouteDatabaseId(event, 'invoice');
  await readZodBody(event, invoiceRetrySchema, 'Invalid delivery request.');
  setResponseStatus(event, 202);
  return retryInvoiceDelivery(id);
});
