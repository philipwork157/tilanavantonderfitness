import { requireCustomer } from '@server/utils/customer-auth';
import { requireRouteDatabaseId } from '@server/utils/route-validation';
import { getInvoiceDocument } from '@server/services/invoice-records';
import { sendInvoicePdf } from '@server/utils/invoice-response';

/** Both invoice ownership and the credit-to-invoice relationship must match. */
export default defineEventHandler(async event => {
  const customer = await requireCustomer(event);
  const id = requireRouteDatabaseId(event, 'invoice');
  const creditId = requireRouteDatabaseId(event, 'credit note', 'creditId');
  return sendInvoicePdf(event, await getInvoiceDocument(id, customer.clientId, creditId));
});
