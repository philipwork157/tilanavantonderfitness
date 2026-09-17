import type { Database } from '@tilana/db/server';
import { orders, paymentDisputes, paymentRecoveryJobs, payments } from '@tilana/db/schema';
import { paystackRecoveryDisputeSchema } from '@tilana/contracts/payments';
import { eq } from 'drizzle-orm';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Payment = Pick<typeof payments.$inferSelect, 'id' | 'orderId' | 'amountCents' | 'currency' | 'environment' | 'status'>;

/** Open disputes alert the operator without pretending money has been refunded.
 * Only a resolved merchant-accepted debit revokes this order; unknown bank outcomes require review.
 */
export async function processPaystackDispute(transaction: Transaction, data: unknown, payment?: Payment) {
  const parsed = paystackRecoveryDisputeSchema.safeParse(data);
  if (!parsed.success || !payment) return { status: 'failed' as const, error: 'Dispute purchase evidence was invalid.' };
  const dispute = parsed.data;
  if (dispute.domain !== payment.environment || dispute.transaction.domain !== payment.environment
    || dispute.transaction.amount !== payment.amountCents || dispute.transaction.currency !== payment.currency
    || (dispute.refund_amount != null && dispute.refund_amount > payment.amountCents)) {
    return { status: 'failed' as const, error: 'Dispute environment, amount, or currency did not match.' };
  }
  if (payment.status === 'pending') return { status: 'received' as const, error: 'Awaiting charge fulfillment.' };
  const [existing] = await transaction.select().from(paymentDisputes)
    .where(eq(paymentDisputes.providerDisputeId, dispute.id)).limit(1);
  if (existing && existing.paymentId !== payment.id) return { status: 'failed' as const, error: 'Dispute belongs to another payment.' };
  if (existing?.providerStatus === 'resolved' && (dispute.status !== 'resolved'
    || (existing.resolution === 'merchant-accepted' && dispute.resolution !== 'merchant-accepted')
    || (existing.resolution === dispute.resolution && existing.amountCents === (dispute.refund_amount ?? null)))) {
    return { status: 'ignored' as const, error: null };
  }
  const now = new Date();
  await transaction.insert(paymentDisputes).values({
    paymentId: payment.id, providerDisputeId: dispute.id, providerStatus: dispute.status,
    resolution: dispute.resolution ?? null, amountCents: dispute.refund_amount ?? null,
  }).onConflictDoUpdate({ target: paymentDisputes.providerDisputeId, set: {
    providerStatus: dispute.status, resolution: dispute.resolution ?? null,
    amountCents: dispute.refund_amount ?? null, updatedAt: now,
  } });
  const reason = dispute.status === 'resolved' ? 'Review resolved dispute accounting and provider outcome.' : 'Open dispute requires evidence in Paystack before its deadline.';
  await transaction.insert(paymentRecoveryJobs).values({ paymentId: payment.id, reviewReason: reason, alertPending: true })
    .onConflictDoUpdate({ target: paymentRecoveryJobs.paymentId, set: { reviewReason: reason, alertPending: true, updatedAt: now } });
  const revoke = dispute.status === 'resolved' && dispute.resolution === 'merchant-accepted';
  if (revoke) {
    // Dispute debits are not refund reservations. Keep actual refund totals unchanged.
    await transaction.update(payments).set({ status: 'reversed', providerStatus: 'dispute_merchant_accepted', updatedAt: now })
      .where(eq(payments.id, payment.id));
    await transaction.update(orders).set({ status: 'refunded', updatedAt: now }).where(eq(orders.id, payment.orderId));
  }
  return { status: 'processed' as const, error: null, revoke };
}
