import { invoiceListQuerySchema } from '@tilana/contracts/invoices';
import { requireAdmin } from '@server/utils/admin-auth';
import { listInvoices } from '@server/services/invoice-records';

/** Administrator-only, bounded invoice history with cursor pagination. */
export default defineEventHandler(async event => {
  await requireAdmin(event);
  const query = invoiceListQuerySchema.safeParse(getQuery(event));
  if (!query.success) throw createError({ statusCode: 400, statusMessage: 'Invalid invoice query.' });
  return listInvoices(undefined, query.data.before);
});
