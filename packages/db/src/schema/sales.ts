import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { programVolumes } from './catalog';
import { clients, profiles } from './identity';

export const orderStatusValues = ['draft', 'pending', 'paid', 'cancelled', 'refunded'] as const;
export type OrderStatus = (typeof orderStatusValues)[number];

export const paymentStatusValues = ['pending', 'succeeded', 'failed', 'refunded'] as const;
export type PaymentStatus = (typeof paymentStatusValues)[number];

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderNumber: text('order_number').notNull(),
    clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'restrict' }),
    status: text('status').$type<OrderStatus>().notNull().default('draft'),
    currency: text('currency').notNull().default('ZAR'),
    subtotalCents: integer('subtotal_cents').notNull().default(0),
    discountCents: integer('discount_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.userId, { onDelete: 'set null' }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('orders_order_number_unique').on(table.orderNumber),
    check('orders_status_value', sql`${table.status} in ('draft', 'pending', 'paid', 'cancelled', 'refunded')`),
    check('orders_currency_format', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      'orders_amounts_valid',
      sql`${table.subtotalCents} >= 0 and ${table.discountCents} >= 0 and ${table.taxCents} >= 0 and ${table.totalCents} >= 0`,
    ),
    check(
      'orders_total_matches_components',
      sql`${table.totalCents} = ${table.subtotalCents} - ${table.discountCents} + ${table.taxCents}`,
    ),
    index('orders_client_created_at_idx').on(table.clientId, table.createdAt),
    index('orders_status_created_at_idx').on(table.status, table.createdAt),
  ],
).enableRLS();

/** The snapshot fields preserve exactly what the client bought and paid at the time. */
export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    programVolumeId: uuid('program_volume_id').references(() => programVolumes.id, { onDelete: 'set null' }),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull().default(1),
    unitPriceCents: integer('unit_price_cents').notNull(),
    lineTotalCents: integer('line_total_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('order_items_description_length', sql`char_length(${table.description}) between 1 and 240`),
    check('order_items_quantity_positive', sql`${table.quantity} > 0`),
    check('order_items_unit_price_non_negative', sql`${table.unitPriceCents} >= 0`),
    check('order_items_total_matches', sql`${table.lineTotalCents} = ${table.quantity} * ${table.unitPriceCents}`),
    index('order_items_order_idx').on(table.orderId),
    index('order_items_program_volume_idx').on(table.programVolumeId),
  ],
).enableRLS();

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'restrict' }),
    status: text('status').$type<PaymentStatus>().notNull().default('pending'),
    provider: text('provider').notNull().default('manual'),
    providerReference: text('provider_reference'),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('ZAR'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('payments_status_value', sql`${table.status} in ('pending', 'succeeded', 'failed', 'refunded')`),
    check('payments_amount_positive', sql`${table.amountCents} > 0`),
    check('payments_currency_format', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    uniqueIndex('payments_provider_reference_unique').on(table.provider, table.providerReference),
    index('payments_order_created_at_idx').on(table.orderId, table.createdAt),
  ],
).enableRLS();
