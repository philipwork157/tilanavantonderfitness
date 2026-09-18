import { requireCustomer } from '@server/utils/customer-auth';
import { requireRouteDatabaseId } from '@server/utils/route-validation';
import { getInvoiceDocument } from '@server/services/invoice-records';
import { sendInvoicePdf } from '@server/utils/invoice-response';

/** Verify client ownership and edition-to-invoice association before streaming. */
export default defineEventHandler(async event => {
  const { clientId } = await requireCustomer(event);
  const id = requireRouteDatabaseId(event, 'invoice');
  const editionId = requireRouteDatabaseId(event, 'edition', 'editionId');
  return sendInvoicePdf(event, await getInvoiceDocument(id, clientId, undefined, editionId));
});
