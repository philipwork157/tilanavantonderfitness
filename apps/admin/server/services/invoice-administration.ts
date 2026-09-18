import { createHash } from 'node:crypto';
import type { Database } from '@tilana/db/server';
import { clients, invoiceCommands, invoiceCredits, invoiceDeliveries, invoiceEditions, invoiceItems, invoicePurchaseReviews, invoices, orderItems, orders, payments } from '@tilana/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { formatBillingDate, type InvoiceActionRequest, type InvoiceReviewRequest, type ManualInvoiceRequest } from '@tilana/contracts/invoices';
import { getDatabase } from '@server/utils/database';
import { assertPaystackDatabaseEnvironment } from '@server/utils/paystack-configuration';
import { INVOICE_SELLER, validateInvoicePurchase } from './invoice-policy';
import { assertBillingTextSupported } from '@server/utils/billing-font';

export type BillingTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type CommandResult = { invoiceId?: number | null; editionId?: number | null; orderId?: number | null };
export type BillingCommand = InvoiceActionRequest | InvoiceReviewRequest | ManualInvoiceRequest;

/** Admin retries serialize by a hashed unpredictable key and bind actor, target and payload. */
export async function runBillingCommand(input: BillingCommand, actorId: number, target: string,
  execute: (transaction: BillingTransaction) => Promise<CommandResult>) {
  await assertPaystackDatabaseEnvironment();
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const keyHash = hash(input.idempotencyKey);
  const requestHash = hash(JSON.stringify({ actorId, target, input }));
  try { return await getDatabase().transaction(async transaction => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${keyHash}, 0))`);
    const [previous] = await transaction.select().from(invoiceCommands).where(eq(invoiceCommands.keyHash, keyHash));
    if (previous) {
      if (previous.requestHash !== requestHash) throw createError({ statusCode: 409, statusMessage: 'Billing retry details changed. Use the original request.' });
      return { invoiceId: previous.invoiceId, editionId: previous.editionId, orderId: previous.orderId };
    }
    const result = await execute(transaction);
    await transaction.insert(invoiceCommands).values({ keyHash, requestHash, action: target, reason: input.reason, createdByUserId: actorId, ...result });
    return { invoiceId: result.invoiceId ?? null, editionId: result.editionId ?? null, orderId: result.orderId ?? null };
  }); } catch (error) {
    const code = (error as { cause?: { code?: string }; code?: string }).cause?.code ?? (error as { code?: string }).code;
    if (code === '23505') throw createError({ statusCode: 409, statusMessage: 'This billing document or receipt reference already exists. Review the existing record.' });
    throw error;
  }
}

/** One shared sequence covers all original invoices, credit notes and manual draft numbers. */
export async function nextBillingNumber(transaction: BillingTransaction, prefix = 'TVT-INV') {
  const [sequence] = await transaction.execute<{ value: string }>(sql`select nextval('billing_document_number')::text as value`);
  return `${prefix}-${sequence!.value.padStart(8, '0')}`;
}

/** Snapshot an existing client and service lines; no charge, email or entitlement is created yet. */
export async function createManualInvoice(input: ManualInvoiceRequest, actorId: number) {
  return runBillingCommand(input, actorId, 'create-manual', async transaction => {
    const [client] = await transaction.select().from(clients).where(eq(clients.id, input.clientId)).for('update');
    if (!client) throw createError({ statusCode: 404, statusMessage: 'Client not found.' });
    if (input.existingOrderId) {
      const [order] = await transaction.select().from(orders).where(and(eq(orders.id, input.existingOrderId), eq(orders.clientId, client.id))).for('update');
      const [existing] = await transaction.select({ id: invoices.id }).from(invoices).where(eq(invoices.orderId, input.existingOrderId));
      const attempts = await transaction.select().from(payments).where(eq(payments.orderId, input.existingOrderId));
      const settled = attempts.filter(payment => payment.provider === 'manual' && payment.status === 'succeeded' && payment.paidAt && payment.refundedAmountCents === 0);
      const [review] = await transaction.select().from(invoicePurchaseReviews).where(eq(invoicePurchaseReviews.orderId, input.existingOrderId));
      const payment = settled[0];
      if (!order || existing || !payment || settled.length !== 1 || (review && review.paymentId !== payment.id) || attempts.some(attempt => attempt.provider !== 'manual')
        || attempts.some(attempt => attempt.id !== payment.id && attempt.paidAt && (!['refunded', 'reversed'].includes(attempt.status) || attempt.refundedAmountCents !== attempt.amountCents))
        || !['paid', 'refunded'].includes(order.status)) {
        throw createError({ statusCode: 409, statusMessage: 'Select a single settled manual purchase without an existing invoice or unresolved payment history.' });
      }
      const clientName = order.customerName || review?.clientName;
      const clientEmail = order.customerEmail || review?.clientEmail;
      if (!clientName || !clientEmail) throw createError({ statusCode: 409, statusMessage: 'Original buyer evidence requires approval before invoicing this legacy order.' });
      const items = await transaction.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      validateInvoicePurchase(order, payment, items);
      await assertBillingTextSupported([clientName, ...items.map(item => item.description)]);
      const now = new Date();
      const [invoice] = await transaction.insert(invoices).values({ ...INVOICE_SELLER, source: 'manual', managed: 1, status: 'draft',
        invoiceNumber: await nextBillingNumber(transaction), orderId: order.id, clientId: client.id, clientName, clientEmail,
        clientPhone: order.customerPhone || review?.clientPhone, subtotalCents: order.subtotalCents, discountCents: order.discountCents,
        totalCents: order.totalCents, settledPaymentId: payment.id, paidAt: payment.paidAt, issuedAt: now, issueDate: formatBillingDate(now), createdByUserId: actorId }).returning();
      await transaction.insert(invoiceItems).values(items.map(item => ({ invoiceId: invoice!.id, programVolumeId: item.programVolumeId,
        description: item.description, quantity: item.quantity, unitPriceCents: item.unitPriceCents, lineTotalCents: item.lineTotalCents })));
      await transaction.update(invoices).set({ status: 'paid' }).where(eq(invoices.id, invoice!.id));
      await transaction.insert(invoiceDeliveries).values({ invoiceId: invoice!.id });
      return { invoiceId: invoice!.id, orderId: order.id };
    }
    await assertBillingTextSupported([client.firstName, client.lastName, ...input.items.map(item => item.description)]);
    if (input.replacesInvoiceId) {
      const [original] = await transaction.select().from(invoices).where(eq(invoices.id, input.replacesInvoiceId)).for('update');
      const [replacement] = await transaction.select({ id: invoices.id }).from(invoices).where(eq(invoices.replacesInvoiceId, input.replacesInvoiceId));
      const credits = await transaction.select().from(invoiceCredits).where(eq(invoiceCredits.invoiceId, input.replacesInvoiceId));
      const fullyCredited = original?.status === 'paid' && credits.reduce((sum, credit) => sum + credit.amountCents, 0) === original.totalCents;
      if (!original || original.clientId !== client.id || original.source !== 'manual' || original.managed !== 1 || (original.status !== 'void' && !fullyCredited) || replacement) {
        throw createError({ statusCode: 409, statusMessage: 'Replacement requires a void or fully credited manual invoice for the same client, without an existing replacement.' });
      }
    }
    const subtotalCents = input.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
    const invoiceNumber = await nextBillingNumber(transaction);
    const [order] = await transaction.insert(orders).values({ orderNumber: `BILL-${invoiceNumber}`, clientId: client.id,
      customerName: `${client.firstName} ${client.lastName}`, customerEmail: client.email, customerPhone: client.phone,
      status: 'draft', subtotalCents, totalCents: subtotalCents, createdByUserId: actorId, notes: input.reason }).returning();
    const [invoice] = await transaction.insert(invoices).values({ ...INVOICE_SELLER, source: 'manual', managed: 1,
      replacesInvoiceId: input.replacesInvoiceId, invoiceNumber, orderId: order!.id, clientId: client.id,
      clientName: order!.customerName!, clientEmail: client.email, clientPhone: client.phone,
      status: 'draft', subtotalCents, totalCents: subtotalCents, createdByUserId: actorId }).returning();
    await transaction.insert(invoiceItems).values(input.items.map(item => ({ ...item, invoiceId: invoice!.id, lineTotalCents: item.quantity * item.unitPriceCents })));
    await transaction.insert(orderItems).values(input.items.map(item => ({ ...item, orderId: order!.id, clientId: client.id, lineTotalCents: item.quantity * item.unitPriceCents })));
    return { invoiceId: invoice!.id, orderId: order!.id };
  });
}

/** Editions correct non-financial customer details, not ownership, recipient, price or settlement. */
export async function addInvoiceEdition(transaction: BillingTransaction, invoice: typeof invoices.$inferSelect,
  input: { clientName: string; clientAddress?: string; clientPhone?: string; reason: string }, actorId: number) {
  await assertBillingTextSupported([input.clientName, input.clientAddress, input.reason]);
  const [edition] = await transaction.insert(invoiceEditions).values({ invoiceId: invoice.id, clientName: input.clientName,
    clientAddress: input.clientAddress || null, clientPhone: input.clientPhone || null, reason: input.reason, createdByUserId: actorId }).returning();
  await transaction.insert(invoiceDeliveries).values({ invoiceId: invoice.id, editionId: edition!.id });
  return edition!.id;
}
