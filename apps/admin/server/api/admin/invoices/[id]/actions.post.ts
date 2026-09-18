import { invoiceActionSchema } from '@tilana/contracts/invoices';
import { applyInvoiceAction } from '@server/services/invoice-actions';
import { requireAdminMutation } from '@server/utils/admin-mutation';
import { readZodBody, requireRouteDatabaseId } from '@server/utils/route-validation';

/** Role and same-origin checks precede every audited lifecycle command. */
export default defineEventHandler(async event => {
  const { user } = await requireAdminMutation(event);
  const id = requireRouteDatabaseId(event, 'invoice');
  const input = await readZodBody(event, invoiceActionSchema, 'Check the billing action.');
  return applyInvoiceAction(id, input, user.id);
});
