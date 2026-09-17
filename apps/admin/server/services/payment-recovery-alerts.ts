import { and, asc, eq, isNull, lte, or } from 'drizzle-orm';
import { paymentRecoveryJobs } from '@tilana/db/schema';
import { paymentRecoveryAlertEmailSchema } from '@tilana/contracts/payments';
import { getDatabase } from '@server/utils/database';
import { getServerEmail } from '@server/utils/email';

/** At-least-once operator alerts. Failures stay durable; never include customer details or provider payloads. */
export async function deliverPaymentRecoveryAlerts() {
  const recipient = paymentRecoveryAlertEmailSchema.safeParse(useRuntimeConfig().paystackRecoveryAlertTo);
  if (!recipient.success) return { sent: 0, failed: 0 };
  const database = getDatabase();
  let sent = 0;
  let failed = 0;
  for (let index = 0; index < 5; index++) {
    const now = new Date();
    const job = await database.transaction(async (transaction) => {
      const [pending] = await transaction.select().from(paymentRecoveryJobs).where(and(
        eq(paymentRecoveryJobs.alertPending, true), or(isNull(paymentRecoveryJobs.leaseUntil), lte(paymentRecoveryJobs.leaseUntil, now)),
      )).orderBy(asc(paymentRecoveryJobs.id)).limit(1).for('update', { skipLocked: true });
      if (!pending) return null;
      const [leased] = await transaction.update(paymentRecoveryJobs).set({
        leaseUntil: new Date(now.getTime() + 10 * 60_000), leaseVersion: pending.leaseVersion + 1, updatedAt: now,
      }).where(eq(paymentRecoveryJobs.id, pending.id)).returning();
      return leased!;
    });
    if (!job) break;
    const ownership = and(eq(paymentRecoveryJobs.id, job.id), eq(paymentRecoveryJobs.leaseVersion, job.leaseVersion));
    try {
      const { sender, from } = getServerEmail();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const delivery = sender.send({
        from, to: [{ email: recipient.data }], subject: `Paystack review needed: payment ${job.paymentId}`,
        text: `Payment ${job.paymentId} requires administrator review. ${job.reviewReason || 'Check the recovery queue.'} Review the matching transaction in Paystack and use the protected admin recovery endpoints.`,
        html: `<p>Payment ${job.paymentId} requires administrator review. Check the protected payment recovery queue and the matching transaction in Paystack.</p>`,
      });
      try {
        await Promise.race([delivery, new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Alert delivery timed out.')), 10_000);
        })]);
      } finally { clearTimeout(timer); }
      // A concurrent dispute may have introduced a new alert while this email was being delivered.
      await database.update(paymentRecoveryJobs).set({ alertPending: false, alertedAt: new Date() })
        .where(and(ownership, eq(paymentRecoveryJobs.updatedAt, job.updatedAt)));
      sent++;
    } catch {
      failed++;
      break; // Do not hammer the same undeliverable message five times in one run.
    } finally {
      await database.update(paymentRecoveryJobs).set({ leaseUntil: null }).where(ownership);
    }
  }
  return { sent, failed };
}
