import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { programVolumes } from './catalog';
import { clients, users } from './identity';

export const orderStatusValues = ['draft', 'pending', 'paid', 'cancelled', 'refunded'] as const;
export type OrderStatus = (typeof orderStatusValues)[number];

export const paymentStatusValues = [
  'pending',
  'succeeded',
  'failed',
  'abandoned',
  'reversed',
  'partially_refunded',
  'refunded',
] as const;
export type PaymentStatus = (typeof paymentStatusValues)[number];

export const paymentEnvironmentValues = ['test', 'live'] as const;
export type PaymentEnvironment = (typeof paymentEnvironmentValues)[number];

export const paymentEventProcessingStatusValues = ['received', 'processed', 'ignored', 'failed'] as const;
export type PaymentEventProcessingStatus = (typeof paymentEventProcessingStatusValues)[number];

export const paymentRefundStatusValues = ['pending', 'processing', 'processed', 'failed', 'needs-attention'] as const;
export type PaymentRefundStatus = (typeof paymentRefundStatusValues)[number];

export const orders = pgTable(
  'orders',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    orderNumber: text('order_number').notNull(),
    clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'restrict' }),
    customerEmail: text('customer_email'),
    status: text('status').$type<OrderStatus>().notNull().default('draft'),
    currency: text('currency').notNull().default('ZAR'),
    subtotalCents: integer('subtotal_cents').notNull().default(0),
    discountCents: integer('discount_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    notes: text('notes'),
    createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('orders_order_number_unique').on(table.orderNumber),
    check('orders_status_value', sql`${table.status} in ('draft', 'pending', 'paid', 'cancelled', 'refunded')`),
    check('orders_currency_format', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      'orders_customer_email_length',
      sql`${table.customerEmail} is null or char_length(${table.customerEmail}) between 3 and 254`,
    ),
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
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
    programVolumeId: integer('program_volume_id').references(() => programVolumes.id, { onDelete: 'set null' }),
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
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'restrict' }),
    status: text('status').$type<PaymentStatus>().notNull().default('pending'),
    provider: text('provider').notNull().default('manual'),
    providerReference: text('provider_reference'),
    providerTransactionId: text('provider_transaction_id'),
    providerStatus: text('provider_status'),
    environment: text('environment').$type<PaymentEnvironment>(),
    accessCode: text('access_code'),
    checkoutUrl: text('checkout_url'),
    channel: text('channel'),
    gatewayResponse: text('gateway_response'),
    failureMessage: text('failure_message'),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('ZAR'),
    feesCents: integer('fees_cents'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'payments_status_value',
      sql`${table.status} in ('pending', 'succeeded', 'failed', 'abandoned', 'reversed', 'partially_refunded', 'refunded')`,
    ),
    check('payments_provider_length', sql`char_length(${table.provider}) between 1 and 50`),
    check(
      'payments_environment_value',
      sql`${table.environment} is null or ${table.environment} in ('test', 'live')`,
    ),
    check(
      'payments_paystack_fields_present',
      sql`${table.provider} <> 'paystack' or (${table.providerReference} is not null and ${table.environment} is not null)`,
    ),
    check(
      'payments_paystack_reference_format',
      sql`${table.provider} <> 'paystack' or ${table.providerReference} ~ '^[A-Za-z0-9.=-]+$'`,
    ),
    check('payments_amount_positive', sql`${table.amountCents} > 0`),
    check('payments_fees_non_negative', sql`${table.feesCents} is null or ${table.feesCents} >= 0`),
    check('payments_currency_format', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    uniqueIndex('payments_provider_reference_unique').on(table.provider, table.providerReference),
    uniqueIndex('payments_provider_transaction_unique')
      .on(table.provider, table.providerTransactionId)
      .where(sql`${table.providerTransactionId} is not null`),
    index('payments_order_created_at_idx').on(table.orderId, table.createdAt),
    index('payments_status_updated_at_idx').on(table.status, table.updatedAt),
  ],
).enableRLS();

/**
 * Idempotency and audit ledger for signed provider webhooks.
 *
 * `providerEventKey` is derived by the server from immutable event fields. A
 * nullable payment link lets us retain and investigate a valid but unmatched
 * provider event without associating it with the wrong order.
 */
export const paymentEvents = pgTable(
  'payment_events',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    paymentId: integer('payment_id').references(() => payments.id, { onDelete: 'set null' }),
    provider: text('provider').notNull(),
    providerEventKey: text('provider_event_key').notNull(),
    eventType: text('event_type').notNull(),
    processingStatus: text('processing_status')
      .$type<PaymentEventProcessingStatus>()
      .notNull()
      .default('received'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    errorMessage: text('error_message'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [
    check('payment_events_provider_length', sql`char_length(${table.provider}) between 1 and 50`),
    check('payment_events_key_length', sql`char_length(${table.providerEventKey}) between 1 and 240`),
    check('payment_events_type_length', sql`char_length(${table.eventType}) between 1 and 120`),
    check(
      'payment_events_processing_status_value',
      sql`${table.processingStatus} in ('received', 'processed', 'ignored', 'failed')`,
    ),
    uniqueIndex('payment_events_provider_key_unique').on(table.provider, table.providerEventKey),
    index('payment_events_payment_received_at_idx').on(table.paymentId, table.receivedAt),
    index('payment_events_processing_received_at_idx').on(table.processingStatus, table.receivedAt),
  ],
).enableRLS();

/** Each Paystack refund is tracked separately so partial refunds remain auditable. */
export const paymentRefunds = pgTable(
  'payment_refunds',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    paymentId: integer('payment_id').notNull().references(() => payments.id, { onDelete: 'restrict' }),
    provider: text('provider').notNull().default('paystack'),
    providerRefundId: text('provider_refund_id'),
    status: text('status').$type<PaymentRefundStatus>().notNull().default('pending'),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('ZAR'),
    customerNote: text('customer_note'),
    merchantNote: text('merchant_note'),
    requestedByUserId: integer('requested_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    expectedAt: timestamp('expected_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('payment_refunds_provider_length', sql`char_length(${table.provider}) between 1 and 50`),
    check(
      'payment_refunds_status_value',
      sql`${table.status} in ('pending', 'processing', 'processed', 'failed', 'needs-attention')`,
    ),
    check('payment_refunds_amount_positive', sql`${table.amountCents} > 0`),
    check('payment_refunds_currency_format', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    uniqueIndex('payment_refunds_provider_id_unique')
      .on(table.provider, table.providerRefundId)
      .where(sql`${table.providerRefundId} is not null`),
    index('payment_refunds_payment_created_at_idx').on(table.paymentId, table.createdAt),
    index('payment_refunds_status_updated_at_idx').on(table.status, table.updatedAt),
  ],
).enableRLS();
