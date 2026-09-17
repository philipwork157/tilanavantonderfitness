import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { payments } from './sales';

/** Durable recurring work, leases and operator alerts. No provider calls hold this row lock. */
export const paymentRecoveryJobs = pgTable('payment_recovery_jobs', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  paymentId: integer('payment_id').notNull().references(() => payments.id, { onDelete: 'restrict' }),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  leaseVersion: integer('lease_version').notNull().default(0),
  reviewReason: text('review_reason'),
  alertPending: boolean('alert_pending').notNull().default(false),
  alertedAt: timestamp('alerted_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('payment_recovery_jobs_payment_unique').on(table.paymentId),
  index('payment_recovery_jobs_due_idx').on(table.nextAttemptAt),
  check('payment_recovery_jobs_counters_valid', sql`${table.attempts} >= 0 and ${table.leaseVersion} >= 0`),
]).enableRLS();

/** Disputes are not ordinary refunds. Keep their provider outcome and amount independently auditable. */
export const paymentDisputes = pgTable('payment_disputes', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  paymentId: integer('payment_id').notNull().references(() => payments.id, { onDelete: 'restrict' }),
  providerDisputeId: text('provider_dispute_id').notNull(),
  providerStatus: text('provider_status').notNull(),
  resolution: text('resolution'),
  amountCents: integer('amount_cents'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('payment_disputes_provider_id_unique').on(table.providerDisputeId),
  index('payment_disputes_payment_idx').on(table.paymentId),
  check('payment_disputes_amount_valid', sql`${table.amountCents} is null or ${table.amountCents} > 0`),
]).enableRLS();
