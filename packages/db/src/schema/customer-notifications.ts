import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { clients } from './identity';
import { orders } from './sales';

/** Durable access-email work. Tokens are generated only during delivery, never stored. */
export const customerNotifications = pgTable('customer_notifications', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'restrict' }),
  orderId: integer('order_id').references(() => orders.id, { onDelete: 'restrict' }),
  kind: text('kind').notNull(),
  deduplicationKey: text('deduplication_key').notNull(),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  leaseVersion: integer('lease_version').notNull().default(0),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  foreignKey({ columns: [table.orderId, table.clientId], foreignColumns: [orders.id, orders.clientId], name: 'customer_notifications_order_client_fk' }).onDelete('restrict'),
  uniqueIndex('customer_notifications_key_unique').on(table.deduplicationKey),
  index('customer_notifications_due_idx').on(table.nextAttemptAt),
  check('customer_notifications_kind_valid', sql`(${table.kind} = 'purchase' and ${table.orderId} is not null) or (${table.kind} = 'login' and ${table.orderId} is null)`),
  check('customer_notifications_counters_valid', sql`${table.attempts} >= 0 and ${table.leaseVersion} >= 0`),
]).enableRLS();
