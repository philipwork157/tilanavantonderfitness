import { z } from 'zod';
export const invoiceEmailSchema = z.string().email().max(254);

/** Safe billing summaries shared by admin and customer views, never provider payloads. */
export const invoiceSummarySchema = z.object({
  id: z.number().int().positive(), invoiceNumber: z.string(), clientName: z.string(),
  status: z.enum(['draft', 'issued', 'paid', 'overdue', 'void']), currency: z.string(),
  totalCents: z.number().int().nonnegative(), creditedCents: z.number().int().nonnegative(),
  issueDate: z.string().nullable(),
  credits: z.array(z.object({ id: z.number().int().positive(), creditNumber: z.string(), amountCents: z.number().int().positive(), reason: z.enum(['refund', 'reversal']) })),
});
export const invoiceListSchema = z.object({ invoices: z.array(invoiceSummarySchema), hasMore: z.boolean() });
export const invoiceListQuerySchema = z.object({ before: z.coerce.number().int().positive().max(2_147_483_647).optional() }).strict();
export const invoiceRetrySchema = z.object({ action: z.literal('retry-delivery') }).strict();
export type InvoiceList = z.infer<typeof invoiceListSchema>;

/** Financial document dates use the seller's timezone, independently of the server region. */
export function formatBillingDate(date: Date) {
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid billing date.');
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Keep integer arithmetic explicit; never derive financial values from formatted strings. */
export function formatInvoiceMoney(cents: number, currency = 'ZAR') {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('Invalid money amount.');
  return `${currency} ${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}
