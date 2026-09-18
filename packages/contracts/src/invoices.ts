import { z } from 'zod';
export const invoiceEmailSchema = z.string().email().max(254);

/** Safe billing summaries shared by admin and customer views, never provider payloads. */
export const invoiceSummarySchema = z.object({
  id: z.number().int().positive(), invoiceNumber: z.string(), clientName: z.string(),
  status: z.enum(['draft', 'issued', 'paid', 'overdue', 'void']), currency: z.string(),
  totalCents: z.number().int().nonnegative(), creditedCents: z.number().int().nonnegative(),
  issueDate: z.string().nullable(),
  editions: z.array(z.object({ id: z.number().int().positive(), issuedAt: z.string() })).default([]),
  credits: z.array(z.object({ id: z.number().int().positive(), creditNumber: z.string(), amountCents: z.number().int().positive(), reason: z.enum(['refund', 'reversal']) })),
});
export const invoiceListSchema = z.object({ invoices: z.array(invoiceSummarySchema), hasMore: z.boolean() });
export const invoiceListQuerySchema = z.object({ before: z.coerce.number().int().positive().max(2_147_483_647).optional() }).strict();
export const invoiceRetrySchema = z.object({ action: z.literal('retry-delivery') }).strict();
export type InvoiceList = z.infer<typeof invoiceListSchema>;

const databaseId = z.number().int().positive().max(2_147_483_647);
const reason = z.string().trim().min(5).max(1000);
const command = { idempotencyKey: z.string().uuid(), reason };
const buyer = { clientName: z.string().trim().min(1).max(200), clientAddress: z.string().trim().max(1000).default(''), clientPhone: z.string().trim().max(40).default('') };
const invoiceLineSchema = z.object({ description: z.string().trim().min(1).max(240), quantity: z.number().int().min(1).max(100), unitPriceCents: z.number().int().min(0).max(10_000_000) }).strict();
/** Manual service invoices never infer payment or programme entitlements from issuance. */
export const manualInvoiceSchema = z.object({ ...command, clientId: databaseId, existingOrderId: databaseId.optional(), items: z.array(invoiceLineSchema).max(20).default([]), replacesInvoiceId: databaseId.optional() }).strict()
  .refine(value => { if (value.existingOrderId) return !value.items.length && !value.replacesInvoiceId;
    const total = value.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0); return total > 0 && total <= 2_000_000_000; }, 'Use original lines for an existing purchase, or supply new invoice items within the supported integer limit.');
export const invoiceActionSchema = z.discriminatedUnion('action', [
  z.object({ ...command, action: z.literal('issue') }).strict(),
  z.object({ ...command, action: z.literal('void') }).strict(),
  z.object({ ...command, ...buyer, action: z.literal('reissue') }).strict(),
  z.object({ ...command, action: z.literal('record-payment'), amountCents: z.number().int().positive().max(2_000_000_000), paidAt: z.string().datetime({ offset: true }), reference: z.string().trim().min(5).max(120) }).strict(),
  z.object({ ...command, action: z.literal('record-refund'), amountCents: z.number().int().positive().max(2_000_000_000), refundedAt: z.string().datetime({ offset: true }), reference: z.string().trim().min(5).max(120) }).strict(),
]);
export const invoiceReviewSchema = z.object({ ...command, paymentId: databaseId, clientName: buyer.clientName, clientPhone: buyer.clientPhone, clientEmail: invoiceEmailSchema, evidence: z.string().trim().min(10).max(1000) }).strict();
export type ManualInvoiceRequest = z.infer<typeof manualInvoiceSchema>;
export type InvoiceActionRequest = z.infer<typeof invoiceActionSchema>;
export type InvoiceReviewRequest = z.infer<typeof invoiceReviewSchema>;

/** Generate documentation from the strict request contracts without another Zod dependency. */
export function getBillingAdminOpenApiSchemas() {
  return { ManualInvoiceRequest: z.toJSONSchema(manualInvoiceSchema, { io: 'input' }),
    InvoiceActionRequest: z.toJSONSchema(invoiceActionSchema, { io: 'input' }),
    InvoiceReviewRequest: z.toJSONSchema(invoiceReviewSchema, { io: 'input' }) };
}

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
