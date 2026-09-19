import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { paymentEvents, paymentRecoveryJobs, paymentRefunds, payments } from '@tilana/db/schema';
import { paystackRecoveryDisputeListSchema, paystackRecoveryRefundListSchema, paystackRecoveryDisputeSchema, paystackRecoveryRefundSchema } from '@tilana/contracts/payments';
import { getDatabase } from '@server/utils/database';
import { assertPaystackDatabaseEnvironment, getPaystackCredentials } from '@server/utils/paystack-configuration';
import { processPaystackEvent, verifyPaystackCheckout } from './paystack';
import { deliverPaymentRecoveryAlerts } from './payment-recovery-alerts';
import { digestEventPayload, paymentEventExpiry, redactedPaymentEventPayload } from '@server/utils/paystack-event-evidence';

/** Retry forever with bounded backoff, escalating instead of silently dropping uncertain money. */
export function recoveryDelay(attempts: number) {
  return Math.min(6 * 60 * 60_000, 60_000 * 2 ** Math.min(Math.max(attempts - 1, 0), 12));
}

/** Remove replay details after their short retention window; keep ledger metadata and digest. */
export async function redactExpiredPaymentEventPayloads(now = new Date()) {
  await getDatabase().update(paymentEvents).set({
    payload: redactedPaymentEventPayload,
    payloadExpiresAt: null,
  }).where(and(
    inArray(paymentEvents.processingStatus, ['processed', 'ignored']),
    isNotNull(paymentEvents.payloadExpiresAt),
    lte(paymentEvents.payloadExpiresAt, now),
  ));
}

/** Read every page before applying any evidence. Overflow is review work, never "no refund" proof. */
async function readProviderList(kind: 'refund' | 'dispute', transactionId: string, secretKey: string) {
  const rows: unknown[] = [];
  for (let page = 1; page <= 3; page++) {
    const response = await $fetch<unknown>(`https://api.paystack.co/${kind}`, {
      query: { transaction: transactionId, perPage: 100, page },
      headers: { Authorization: `Bearer ${secretKey}` }, timeout: 10_000, retry: 0,
    });
    const parsed = kind === 'refund' ? paystackRecoveryRefundListSchema.safeParse(response) : paystackRecoveryDisputeListSchema.safeParse(response);
    if (!parsed.success) throw new Error('Invalid provider recovery evidence.');
    rows.push(...parsed.data.data);
    if (parsed.data.data.length < 100) return rows;
  }
  throw new Error('Provider pagination requires operator review.');
}

/** No charge/refund creation here. Reuse the signed-evidence transaction paths and their constraints. */
export async function reconcilePayment(paymentId: number) {
  const { secretKey, environment } = getPaystackCredentials();
  await assertPaystackDatabaseEnvironment();
  const database = getDatabase();
  let [payment] = await database.select().from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.provider, 'paystack'), eq(payments.environment, environment))).limit(1);
  if (!payment?.providerReference) throw createError({ statusCode: 404, statusMessage: 'Payment not found in this environment.' });
  await verifyPaystackCheckout(payment.providerReference, true);
  [payment] = await database.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
  if (!payment) throw new Error('Payment disappeared during reconciliation.');
  if (payment.status === 'pending') throw new Error('Payment remains pending.');
  if (['failed', 'abandoned'].includes(payment.status)) return;
  if (!payment.providerTransactionId) throw new Error('Provider transaction ID requires review.');

  const refundRows = await readProviderList('refund', payment.providerTransactionId, secretKey);
  const disputeRows = await readProviderList('dispute', payment.providerTransactionId, secretKey);
  // Parsing individual rows keeps the cumulative paginated collection independent of page-size limits.
  const refunds = refundRows.map(row => paystackRecoveryRefundSchema.parse(row));
  const disputes = disputeRows.map(row => paystackRecoveryDisputeSchema.parse(row));
  for (const refund of refunds) {
    if (refund.transaction !== payment.providerTransactionId || refund.domain !== environment
      || refund.currency !== payment.currency || refund.amount > payment.amountCents) throw new Error('Refund ownership evidence requires review.');
  }
  for (const dispute of disputes) {
    if (dispute.domain !== environment || dispute.transaction.domain !== environment
      || dispute.transaction.id !== payment.providerTransactionId || dispute.transaction.reference !== payment.providerReference
      || dispute.transaction.amount !== payment.amountCents || dispute.transaction.currency !== payment.currency
      || (dispute.refund_amount != null && dispute.refund_amount > payment.amountCents)) throw new Error('Dispute ownership evidence requires review.');
  }
  const deferred = await database.select().from(paymentEvents).where(and(
    eq(paymentEvents.paymentId, payment.id), eq(paymentEvents.processingStatus, 'received'),
  )).orderBy(asc(paymentEvents.id)).limit(20);
  for (const event of deferred) await processPaystackEvent(event.payload, event.providerEventKey);
  const evidence = [
    ...refunds.map(refund => ({
      key: `recovery:refund:${refund.id}:${refund.status}`,
      payload: { event: `refund.${refund.status}`, data: { ...refund, transaction_reference: payment!.providerReference } },
    })),
    ...disputes.map(dispute => ({
      key: `recovery:dispute:${createHash('sha256').update(JSON.stringify(dispute)).digest('hex')}`,
      payload: { event: dispute.status === 'resolved' ? 'charge.dispute.resolve' : 'charge.dispute.create', data: dispute },
    })),
  ];
  for (const event of evidence) {
    await processPaystackEvent(event.payload, event.key);
    const [stored] = await database.select().from(paymentEvents).where(eq(paymentEvents.providerEventKey, event.key)).limit(1);
    if (stored?.processingStatus === 'failed') throw new Error('Provider event matching requires operator review.');
  }
  const [unresolved] = await database.select({ id: paymentRefunds.id }).from(paymentRefunds).where(and(
    eq(paymentRefunds.paymentId, payment.id), sql`${paymentRefunds.status} in ('pending', 'processing', 'needs-attention')`,
  )).limit(1);
  if (unresolved) throw new Error('Refund remains unresolved; its amount stays reserved.');
}

/** Seed bounded durable work, then atomically lease it across machines with SKIP LOCKED. */
export async function runPaymentRecovery() {
  getPaystackCredentials();
  await assertPaystackDatabaseEnvironment();
  const database = getDatabase();
  const now = new Date();
  await redactExpiredPaymentEventPayloads(now);
  await database.execute(sql`
    insert into payment_recovery_jobs (payment_id)
    select p.id from payments p left join payment_recovery_jobs j on j.payment_id = p.id
    where p.provider = 'paystack' and j.id is null and p.created_at < ${new Date(now.getTime() - 120_000).toISOString()}::timestamptz
    order by p.id limit 100 on conflict (payment_id) do nothing
  `);
  let processed = 0;
  let retried = 0;
  const deadline = Date.now() + 150_000;
  for (let index = 0; index < 20 && Date.now() < deadline; index++) {
    const job = await database.transaction(async (transaction) => {
      const [due] = await transaction.select().from(paymentRecoveryJobs).where(and(
        lte(paymentRecoveryJobs.nextAttemptAt, now), or(isNull(paymentRecoveryJobs.leaseUntil), lte(paymentRecoveryJobs.leaseUntil, now)),
      )).orderBy(sql`case when
        exists (select 1 from payments p where p.id = ${paymentRecoveryJobs.paymentId} and p.status = 'pending')
        or exists (select 1 from payment_refunds r where r.payment_id = ${paymentRecoveryJobs.paymentId} and r.status in ('pending', 'processing', 'needs-attention'))
        then 0 else 1 end`, asc(paymentRecoveryJobs.nextAttemptAt), asc(paymentRecoveryJobs.id)).limit(1).for('update', { skipLocked: true });
      if (!due) return null;
      const [leased] = await transaction.update(paymentRecoveryJobs).set({
        leaseUntil: new Date(now.getTime() + 10 * 60_000), leaseVersion: due.leaseVersion + 1, updatedAt: now,
      }).where(eq(paymentRecoveryJobs.id, due.id)).returning();
      return leased!;
    });
    if (!job) break;
    try {
      await reconcilePayment(job.paymentId);
      await database.update(paymentRecoveryJobs).set({
        attempts: 0, leaseUntil: null, nextAttemptAt: new Date(Date.now() + 6 * 60 * 60_000), updatedAt: new Date(),
      }).where(and(eq(paymentRecoveryJobs.id, job.id), eq(paymentRecoveryJobs.leaseVersion, job.leaseVersion)));
      processed++;
    } catch {
      // Never persist arbitrary provider exceptions: they may contain secrets, URLs or customer data.
      const attempts = job.attempts + 1;
      await database.update(paymentRecoveryJobs).set({
        attempts, leaseUntil: null, nextAttemptAt: new Date(Date.now() + recoveryDelay(attempts)),
        ...(attempts >= 8 && { reviewReason: 'Payment/refund recovery needs Paystack review.', alertPending: true }), updatedAt: new Date(),
      }).where(and(eq(paymentRecoveryJobs.id, job.id), eq(paymentRecoveryJobs.leaseVersion, job.leaseVersion)));
      retried++;
    }
  }
  const alerts = await deliverPaymentRecoveryAlerts();
  return { processed, retried, alerts };
}

/** Admin replay uses only already-stored, trusted evidence and leaves the original audit row intact. */
export async function replayPaymentEvent(eventId: number, administratorUserId: number) {
  await assertPaystackDatabaseEnvironment();
  const database = getDatabase();
  const [event] = await database.select().from(paymentEvents)
    .where(and(eq(paymentEvents.id, eventId), eq(paymentEvents.provider, 'paystack'))).limit(1);
  if (!event) throw createError({ statusCode: 404, statusMessage: 'Payment event not found.' });
  if (!['received', 'failed'].includes(event.processingStatus)) throw createError({ statusCode: 409, statusMessage: 'Only deferred or failed evidence can be replayed.' });
  const key = `admin-replay:${administratorUserId}:${event.id}:${randomUUID()}`;
  await processPaystackEvent(event.payload, key);
  const [result] = await database.select({ id: paymentEvents.id, processingStatus: paymentEvents.processingStatus })
    .from(paymentEvents).where(eq(paymentEvents.providerEventKey, key)).limit(1);
  return result;
}

/** Enqueue, do not synchronously call the provider from an operator mutation. */
export async function requestPaymentRecovery(paymentId: number, administratorUserId: number, action: 'reconcile' | 'acknowledge' = 'reconcile') {
  await assertPaystackDatabaseEnvironment();
  const database = getDatabase();
  return database.transaction(async (transaction) => {
    const [payment] = await transaction.select({ id: payments.id }).from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.provider, 'paystack'))).limit(1).for('update');
    if (!payment) throw createError({ statusCode: 404, statusMessage: 'Payment not found.' });
    const [job] = await transaction.select().from(paymentRecoveryJobs).where(eq(paymentRecoveryJobs.paymentId, paymentId)).limit(1).for('update');
    if (job?.leaseUntil && job.leaseUntil > new Date()) throw createError({ statusCode: 409, statusMessage: 'Recovery is already running.' });
    if (action === 'acknowledge') {
      if (!job) throw createError({ statusCode: 404, statusMessage: 'Recovery job not found.' });
      await transaction.update(paymentRecoveryJobs).set({ reviewReason: null, alertPending: false, updatedAt: new Date() })
        .where(eq(paymentRecoveryJobs.id, job.id));
    } else {
      await transaction.insert(paymentRecoveryJobs).values({ paymentId }).onConflictDoUpdate({
        target: paymentRecoveryJobs.paymentId, set: { nextAttemptAt: new Date(), attempts: 0, updatedAt: new Date() },
      });
    }
    await transaction.insert(paymentEvents).values({
      paymentId, provider: 'internal', providerEventKey: `recovery-request:${randomUUID()}`,
      eventType: `admin.recovery.${action}`, processingStatus: 'processed',
      payload: { administratorUserId, previousReviewReason: job?.reviewReason ?? null },
      payloadDigest: digestEventPayload({ administratorUserId, previousReviewReason: job?.reviewReason ?? null }),
      payloadExpiresAt: paymentEventExpiry(), processedAt: new Date(),
    });
    return action === 'acknowledge' ? { acknowledged: true } : { queued: true };
  });
}
