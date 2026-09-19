import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';

/** Short-lived, pseudonymous counters shared by every application instance. */
export const abuseLimits = pgTable('abuse_limits', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  bucketKey: varchar('bucket_key', { length: 200 }).notNull(),
  requestCount: integer('request_count').notNull().default(1),
  resetAt: timestamp('reset_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('abuse_limits_bucket_key_unique').on(table.bucketKey),
  index('abuse_limits_reset_at_idx').on(table.resetAt),
  check('abuse_limits_request_count_positive', sql`${table.requestCount} > 0`),
]).enableRLS();
