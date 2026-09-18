import { invoiceListQuerySchema } from '@tilana/contracts/invoices';
import { requireCustomer } from '@server/utils/customer-auth';
import { listInvoices } from '@server/services/invoice-records';

/** Customers see only their own invoices, including refunded purchases. */
export default defineEventHandler(async event => {
  const customer = await requireCustomer(event);
  const query = invoiceListQuerySchema.safeParse(getQuery(event));
  if (!query.success) throw createError({ statusCode: 400, statusMessage: 'Invalid invoice query.' });
  return listInvoices(customer.clientId, query.data.before);
});
