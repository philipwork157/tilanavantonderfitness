import { eq } from 'drizzle-orm';
import { invoiceCommands, invoiceEditions, orderItems, orders, payments } from '@tilana/db/schema';
import { getDatabase } from '@server/utils/database';
import { assertPaystackDatabaseEnvironment } from '@server/utils/paystack-configuration';
import { getInvoiceDocument } from './invoice-records';

/** Select only operational evidence, never provider authorizations, raw payloads or checkout tokens. */
const paymentFields = { id: payments.id, provider: payments.provider, status: payments.status, amountCents: payments.amountCents,
  refundedAmountCents: payments.refundedAmountCents, currency: payments.currency, paidAt: payments.paidAt, reference: payments.providerReference };

/** Administrator-only original evidence for exceptional snapshot/payment allocation approval. */
export async function inspectInvoicePurchase(orderId: number) {
  await assertPaystackDatabaseEnvironment();
  const db = getDatabase();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw createError({ statusCode: 404, statusMessage: 'Order not found.' });
  return { order, items: await db.select().from(orderItems).where(eq(orderItems.orderId, orderId)),
    payments: await db.select(paymentFields).from(payments).where(eq(payments.orderId, orderId)) };
}

/** Read-only billing audit view distinguishes original snapshots from later editions and commands. */
export async function inspectInvoice(invoiceId: number) {
  const document = await getInvoiceDocument(invoiceId);
  const db = getDatabase();
  return { ...document, editions: await db.select().from(invoiceEditions).where(eq(invoiceEditions.invoiceId, invoiceId)),
    commands: await db.select({ action: invoiceCommands.action, reason: invoiceCommands.reason, actorId: invoiceCommands.createdByUserId, createdAt: invoiceCommands.createdAt }).from(invoiceCommands).where(eq(invoiceCommands.invoiceId, invoiceId)),
    payments: document.invoice.orderId ? await db.select(paymentFields).from(payments).where(eq(payments.orderId, document.invoice.orderId)) : [] };
}
