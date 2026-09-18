import { eq, sql } from 'drizzle-orm';
import { clients, invoiceCredits, invoiceDeliveries, invoiceItems, invoices, orders, payments, paymentRefunds } from '@tilana/db/schema';
import { formatBillingDate, type InvoiceActionRequest } from '@tilana/contracts/invoices';
import { addInvoiceEdition, nextBillingNumber, runBillingCommand } from './invoice-administration';
import { validateInvoicePurchase } from './invoice-policy';
import { revokeOrderAccess } from './paystack';

/** Reject future/invalid receipt dates; admins attest bank/cash evidence, never Paystack truth. */
function evidenceDate(raw: string) {
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now()) throw createError({ statusCode: 400, statusMessage: 'Receipt date must not be in the future.' });
  return date;
}

/** Explicit lifecycle commands preserve originals and make financial changes evidence-driven. */
export async function applyInvoiceAction(invoiceId: number, input: InvoiceActionRequest, actorId: number) {
  return runBillingCommand(input, actorId, `${input.action}:${invoiceId}`, async transaction => {
    // Lock the order first, matching fulfillment/reconciliation lock order.
    const [lookup] = await transaction.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!lookup || (lookup.source !== 'purchase' && lookup.managed !== 1)) throw createError({ statusCode: 404, statusMessage: 'Invoice not found.' });
    // Match the manual editor/creation client->order lock order. Refund replacement
    // grants can otherwise wait on client FK locks while an editor waits on our order.
    if (lookup.source === 'manual') await transaction.select({ id: clients.id }).from(clients).where(eq(clients.id, lookup.clientId)).for('update');
    if (lookup.orderId) await transaction.select({ id: orders.id }).from(orders).where(eq(orders.id, lookup.orderId)).for('update');
    const [invoice] = await transaction.select().from(invoices).where(eq(invoices.id, invoiceId)).for('update');
    if (!invoice) throw createError({ statusCode: 404, statusMessage: 'Invoice not found.' });
    const conflict = () => createError({ statusCode: 409, statusMessage: 'Invoice state does not permit this action. Financial changes require confirmed payment or refund evidence.' });
    const now = new Date();
    if (input.action === 'reissue') {
      if (!['issued', 'paid'].includes(invoice.status)) throw conflict();
      return { invoiceId, editionId: await addInvoiceEdition(transaction, invoice, input, actorId) };
    }
    if (invoice.source !== 'manual' || invoice.managed !== 1 || !invoice.orderId) throw conflict();
    if (input.action === 'issue') {
      if (invoice.status !== 'draft') throw conflict();
      const items = await transaction.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
      validateInvoicePurchase(invoice, { amountCents: invoice.totalCents, currency: invoice.currency }, items);
      await transaction.update(invoices).set({ status: 'issued', issuedAt: now, issueDate: formatBillingDate(now) }).where(eq(invoices.id, invoiceId));
      await transaction.update(orders).set({ status: 'pending', updatedAt: now }).where(eq(orders.id, invoice.orderId));
      await transaction.insert(invoiceDeliveries).values({ invoiceId });
    } else if (input.action === 'void') {
      if (!['draft', 'issued'].includes(invoice.status) || invoice.settledPaymentId || invoice.paidAt) throw conflict();
      await transaction.update(invoices).set({ status: 'void', updatedAt: now }).where(eq(invoices.id, invoiceId));
      await transaction.update(orders).set({ status: 'cancelled', updatedAt: now }).where(eq(orders.id, invoice.orderId));
      // Version ownership prevents any in-flight sender from acknowledging this cancellation.
      await transaction.update(invoiceDeliveries).set({ canceledAt: now, leaseUntil: null, leaseVersion: sql`lease_version + 1` }).where(eq(invoiceDeliveries.invoiceId, invoiceId));
    } else if (input.action === 'record-payment') {
      if (invoice.status !== 'issued' || invoice.settledPaymentId || input.amountCents !== invoice.totalCents) throw conflict();
      const paidAt = evidenceDate(input.paidAt);
      const [payment] = await transaction.insert(payments).values({ orderId: invoice.orderId, provider: 'manual', status: 'succeeded',
        providerReference: input.reference.toUpperCase(), gatewayResponse: input.reason, amountCents: input.amountCents, paidAt }).returning();
      await transaction.update(orders).set({ status: 'paid', paidAt, updatedAt: now }).where(eq(orders.id, invoice.orderId));
      await transaction.update(invoices).set({ status: 'paid', paidAt, settledPaymentId: payment!.id, updatedAt: now }).where(eq(invoices.id, invoiceId));
      return { invoiceId, editionId: await addInvoiceEdition(transaction, invoice, { clientName: invoice.clientName, clientAddress: invoice.clientAddress ?? '', clientPhone: invoice.clientPhone ?? '', reason: `Payment recorded: ${input.reason}`.slice(0, 1000) }, actorId) };
    } else {
      if (invoice.status !== 'paid' || !invoice.settledPaymentId) throw conflict();
      const [payment] = await transaction.select().from(payments).where(eq(payments.id, invoice.settledPaymentId)).for('update');
      if (!payment || payment.provider !== 'manual' || input.amountCents > payment.amountCents - payment.refundedAmountCents) throw conflict();
      const refundedAt = evidenceDate(input.refundedAt);
      if (!payment.paidAt || refundedAt < payment.paidAt) throw createError({ statusCode: 400, statusMessage: 'Refund date must not precede the original receipt.' });
      const [refund] = await transaction.insert(paymentRefunds).values({ paymentId: payment.id, provider: 'manual', status: 'processed',
        providerRefundReference: input.reference.toUpperCase(), amountCents: input.amountCents, currency: invoice.currency, merchantNote: input.reason, requestedByUserId: actorId, refundedAt }).returning();
      const refundedAmountCents = payment.refundedAmountCents + input.amountCents;
      await transaction.update(payments).set({ refundedAmountCents, status: refundedAmountCents === payment.amountCents ? 'refunded' : 'partially_refunded', updatedAt: now }).where(eq(payments.id, payment.id));
      if (refundedAmountCents === payment.amountCents) {
        await transaction.update(orders).set({ status: 'refunded', updatedAt: now }).where(eq(orders.id, invoice.orderId));
        await revokeOrderAccess(transaction, invoice.orderId);
      }
      const [credit] = await transaction.insert(invoiceCredits).values({ invoiceId, paymentId: payment.id, refundId: refund!.id, reason: 'refund',
        creditNumber: await nextBillingNumber(transaction, 'TVT-CN'), sourceKey: `refund:${refund!.id}`, amountCents: input.amountCents }).returning();
      await transaction.insert(invoiceDeliveries).values({ invoiceId, creditId: credit!.id });
    }
    return { invoiceId };
  });
}
