import { requireCustomer } from '@server/utils/customer-auth';
import { requireRouteDatabaseId } from '@server/utils/route-validation';
import { getInvoiceDocument } from '@server/services/invoice-records';
import { sendInvoicePdf } from '@server/utils/invoice-response';

/** Client ownership, not active program entitlement, protects financial history. */
export default defineEventHandler(async event => {
  const customer = await requireCustomer(event);
  const id = requireRouteDatabaseId(event, 'invoice');
  return sendInvoicePdf(event, await getInvoiceDocument(id, customer.clientId));
});
