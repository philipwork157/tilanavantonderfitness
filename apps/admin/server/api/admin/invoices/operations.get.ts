import { and, asc, eq, isNull } from 'drizzle-orm';
import { invoiceDeliveries, invoiceProcessingJobs } from '@tilana/db/schema';
import { requireAdmin } from '@server/utils/admin-auth';
import { getDatabase } from '@server/utils/database';
import { assertPaystackDatabaseEnvironment } from '@server/utils/paystack-configuration';

/** Minimal protected backlog visibility; failures remain durable rather than being silently discarded. */
export default defineEventHandler(async event => {
  await requireAdmin(event);
  await assertPaystackDatabaseEnvironment();
  const database = getDatabase();
  const review = await database.select().from(invoiceProcessingJobs).where(eq(invoiceProcessingJobs.reviewRequired, 1)).orderBy(asc(invoiceProcessingJobs.id)).limit(100);
  const deliveries = await database.select().from(invoiceDeliveries).where(and(isNull(invoiceDeliveries.sentAt), isNull(invoiceDeliveries.canceledAt))).orderBy(asc(invoiceDeliveries.nextAttemptAt)).limit(100);
  return { review, deliveries };
});
