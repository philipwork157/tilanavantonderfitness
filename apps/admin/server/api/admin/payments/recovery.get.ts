import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { paymentEvents, paymentRecoveryJobs } from '@tilana/db/schema';
import { requireAdmin } from '@server/utils/admin-auth';
import { getDatabase } from '@server/utils/database';

/** Safe operator queue: internal IDs and summaries only, no provider secrets or customer payloads. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  setHeader(event, 'cache-control', 'no-store');
  const database = getDatabase();
  const [jobs, events] = await Promise.all([
    database.select().from(paymentRecoveryJobs)
      .orderBy(desc(paymentRecoveryJobs.alertPending), asc(paymentRecoveryJobs.nextAttemptAt)).limit(100),
    database.select({ id: paymentEvents.id, paymentId: paymentEvents.paymentId,
      eventType: paymentEvents.eventType, processingStatus: paymentEvents.processingStatus, errorMessage: paymentEvents.errorMessage })
      .from(paymentEvents).where(and(eq(paymentEvents.provider, 'paystack'), inArray(paymentEvents.processingStatus, ['received', 'failed'])))
      .orderBy(desc(paymentEvents.id)).limit(100),
  ]);
  return { jobs, events };
});
