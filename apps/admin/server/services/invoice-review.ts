import { and, eq, inArray, isNotNull, or } from 'drizzle-orm';
import { invoiceProcessingJobs, invoicePurchaseReviews, invoices, orders, payments } from '@tilana/db/schema';
import type { InvoiceReviewRequest } from '@tilana/contracts/invoices';
import { runBillingCommand } from './invoice-administration';
import { assertBillingTextSupported } from '@server/utils/billing-font';

/** Approve evidence, not guessed profile history; unresolved overpayments remain blocked. */
export async function approveInvoicePurchaseReview(orderId: number, input: InvoiceReviewRequest, actorId: number) {
  return runBillingCommand(input, actorId, `approve-review:${orderId}`, async transaction => {
    await assertBillingTextSupported([input.clientName]);
    const [order] = await transaction.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw createError({ statusCode: 404, statusMessage: 'Order not found.' });
    const attempts = await transaction.select().from(payments).where(and(eq(payments.orderId, orderId), inArray(payments.provider, ['paystack', 'manual']), isNotNull(payments.paidAt), inArray(payments.status, ['succeeded', 'partially_refunded', 'refunded', 'reversed'])));
    const selected = attempts.find(payment => payment.id === input.paymentId);
    const [invoice] = await transaction.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.orderId, orderId), or(eq(invoices.source, 'purchase'), eq(invoices.managed, 1))));
    const [review] = await transaction.select({ id: invoicePurchaseReviews.id }).from(invoicePurchaseReviews).where(eq(invoicePurchaseReviews.orderId, orderId));
    if (invoice || review || !selected || attempts.some(payment => payment.provider !== selected.provider)
      || attempts.some(payment => payment.id !== selected.id && !['refunded', 'reversed'].includes(payment.status))
      || attempts.some(payment => payment.id !== selected.id && payment.refundedAmountCents !== payment.amountCents)
      || (order.customerName && order.customerName !== input.clientName)
      || (order.customerEmail && order.customerEmail.toLowerCase() !== input.clientEmail.toLowerCase())
      || (order.customerPhone && order.customerPhone !== input.clientPhone)) {
      throw createError({ statusCode: 409, statusMessage: 'Review conflicts with original evidence or has unresolved extra settlements. Resolve provider outcomes first.' });
    }
    await transaction.insert(invoicePurchaseReviews).values({ orderId, paymentId: input.paymentId,
      clientName: input.clientName, clientEmail: input.clientEmail.toLowerCase(), clientPhone: input.clientPhone || null,
      evidence: input.evidence, createdByUserId: actorId });
    await transaction.update(invoiceProcessingJobs).set({ nextAttemptAt: new Date() }).where(eq(invoiceProcessingJobs.orderId, orderId));
    return { orderId };
  });
}
