import { manualInvoiceSchema } from '@tilana/contracts/invoices';
import { createManualInvoice } from '@server/services/invoice-administration';
import { requireAdminMutation } from '@server/utils/admin-mutation';
import { readZodBody } from '@server/utils/route-validation';

/** Create only a draft; issuance and confirmed settlement are separate admin actions. */
export default defineEventHandler(async event => {
  const { user } = await requireAdminMutation(event);
  const input = await readZodBody(event, manualInvoiceSchema, 'Check the invoice details.');
  const result = await createManualInvoice(input, user.id);
  setResponseStatus(event, 201);
  return result;
});
