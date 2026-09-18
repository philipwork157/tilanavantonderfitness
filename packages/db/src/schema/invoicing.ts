import { sql } from 'drizzle-orm';
import { type AnyPgColumn, check, date, foreignKey, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { programVolumes } from './catalog';
import { clients, users } from './identity';
import { orders, payments, paymentRefunds } from './sales';

export const invoiceStatusValues = ['draft', 'issued', 'paid', 'overdue', 'void'] as const;
export type InvoiceStatus = (typeof invoiceStatusValues)[number];

export const invoices = pgTable(
  'invoices',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    invoiceNumber: text('invoice_number').notNull(),
    source: text('source').$type<'manual' | 'purchase'>().notNull().default('manual'),
    managed: integer('managed').notNull().default(0),
    replacesInvoiceId: integer('replaces_invoice_id').references((): AnyPgColumn => invoices.id, { onDelete: 'restrict' }),
    settledPaymentId: integer('settled_payment_id').references(() => payments.id, { onDelete: 'restrict' }),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
    clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'restrict' }),
    orderId: integer('order_id').references(() => orders.id, { onDelete: 'set null' }),
    status: text('status').$type<InvoiceStatus>().notNull().default('draft'),
    currency: text('currency').notNull().default('ZAR'),
    subtotalCents: integer('subtotal_cents').notNull().default(0),
    discountCents: integer('discount_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull().default(0),
    sellerName: text('seller_name').notNull(),
    sellerEmail: text('seller_email'),
    sellerPhone: text('seller_phone'),
    sellerAddress: text('seller_address'),
    sellerTaxNumber: text('seller_tax_number'),
    clientName: text('client_name').notNull(),
    clientEmail: text('client_email').notNull(),
    clientPhone: text('client_phone'),
    clientAddress: text('client_address'),
    issueDate: date('issue_date'),
    dueDate: date('due_date'),
    notes: text('notes'),
    pdfR2Bucket: text('pdf_r2_bucket'),
    pdfR2ObjectKey: text('pdf_r2_object_key'),
    createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('invoices_invoice_number_unique').on(table.invoiceNumber),
    uniqueIndex('invoices_replacement_unique').on(table.replacesInvoiceId),
    check('invoices_managed_valid', sql`${table.managed} in (0, 1)`),
    uniqueIndex('invoices_purchase_order_unique').on(table.orderId).where(sql`${table.source} = 'purchase'`),
    uniqueIndex('invoices_managed_order_unique').on(table.orderId).where(sql`${table.managed} = 1`),
    foreignKey({ name: 'invoices_order_client_fk', columns: [table.orderId, table.clientId], foreignColumns: [orders.id, orders.clientId] }).onDelete('restrict'),
    check('invoices_source_valid', sql`${table.source} in ('manual', 'purchase')`),
    check('invoices_purchase_settlement_present', sql`${table.source} <> 'purchase' or (${table.orderId} is not null and ${table.settledPaymentId} is not null and ${table.status} in ('draft', 'paid') and ${table.taxCents} = 0 and ${table.sellerTaxNumber} is null)`),
    index('invoices_order_idx').on(table.orderId),
    uniqueIndex('invoices_pdf_r2_object_unique').on(table.pdfR2Bucket, table.pdfR2ObjectKey),
    check('invoices_status_value', sql`${table.status} in ('draft', 'issued', 'paid', 'overdue', 'void')`),
    check('invoices_currency_format', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      'invoices_pdf_r2_fields_together',
      sql`(${table.pdfR2Bucket} is null and ${table.pdfR2ObjectKey} is null) or (${table.pdfR2Bucket} is not null and ${table.pdfR2ObjectKey} is not null)`,
    ),
    check(
      'invoices_amounts_valid',
      sql`${table.subtotalCents} >= 0 and ${table.discountCents} >= 0 and ${table.taxCents} >= 0 and ${table.totalCents} >= 0`,
    ),
    check(
      'invoices_total_matches_components',
      sql`${table.totalCents} = ${table.subtotalCents} - ${table.discountCents} + ${table.taxCents}`,
    ),
    check('invoices_dates_valid', sql`${table.dueDate} is null or ${table.issueDate} is null or ${table.dueDate} >= ${table.issueDate}`),
    index('invoices_client_created_at_idx').on(table.clientId, table.createdAt),
    index('invoices_status_due_date_idx').on(table.status, table.dueDate),
  ],
).enableRLS();

/** Append-only adjustments preserve the issued invoice and provider evidence. */
export const invoiceCredits = pgTable('invoice_credits', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  invoiceId: integer('invoice_id').notNull().references(() => invoices.id, { onDelete: 'restrict' }),
  paymentId: integer('payment_id').notNull().references(() => payments.id, { onDelete: 'restrict' }),
  refundId: integer('refund_id').references(() => paymentRefunds.id, { onDelete: 'restrict' }),
  creditNumber: text('credit_number').notNull(),
  sourceKey: text('source_key').notNull(),
  reason: text('reason').$type<'refund' | 'reversal'>().notNull(),
  amountCents: integer('amount_cents').notNull(),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('invoice_credits_number_unique').on(table.creditNumber),
  uniqueIndex('invoice_credits_source_unique').on(table.sourceKey),
  uniqueIndex('invoice_credits_refund_unique').on(table.refundId),
  check('invoice_credits_amount_positive', sql`${table.amountCents} > 0`),
  check('invoice_credits_reason_valid', sql`(${table.reason} = 'refund' and ${table.refundId} is not null) or (${table.reason} = 'reversal' and ${table.refundId} is null)`),
  index('invoice_credits_invoice_idx').on(table.invoiceId),
]).enableRLS();

/** Append-only non-financial reissues keep the original invoice and settlement intact. */
export const invoiceEditions = pgTable('invoice_editions', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  invoiceId: integer('invoice_id').notNull().references(() => invoices.id, { onDelete: 'restrict' }),
  clientName: text('client_name').notNull(),
  clientAddress: text('client_address'),
  clientPhone: text('client_phone'),
  reason: text('reason').notNull(),
  createdByUserId: integer('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [index('invoice_editions_invoice_idx').on(table.invoiceId),
  check('invoice_editions_reason_length', sql`char_length(${table.reason}) between 5 and 1000`),
  check('invoice_editions_name_length', sql`char_length(${table.clientName}) between 1 and 200`),
]).enableRLS();

/** Each reissue has a separate outbox record; initial and credit targets remain unique. */
export const invoiceDeliveries = pgTable('invoice_deliveries', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  invoiceId: integer('invoice_id').notNull().references(() => invoices.id, { onDelete: 'restrict' }),
  creditId: integer('credit_id').references(() => invoiceCredits.id, { onDelete: 'restrict' }),
  editionId: integer('edition_id').references(() => invoiceEditions.id, { onDelete: 'restrict' }),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  leaseVersion: integer('lease_version').notNull().default(0),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  canceledAt: timestamp('canceled_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('invoice_deliveries_invoice_unique').on(table.invoiceId).where(sql`${table.creditId} is null and ${table.editionId} is null`),
  uniqueIndex('invoice_deliveries_edition_unique').on(table.editionId),
  check('invoice_deliveries_single_document', sql`${table.creditId} is null or ${table.editionId} is null`),
  uniqueIndex('invoice_deliveries_credit_unique').on(table.creditId),
  check('invoice_deliveries_attempts_valid', sql`${table.attempts} >= 0 and ${table.leaseVersion} >= 0`),
  index('invoice_deliveries_due_idx').on(table.nextAttemptAt),
]).enableRLS();

/** Failed issuance is scheduled separately so one bad legacy purchase cannot starve new orders. */
export const invoiceProcessingJobs = pgTable('invoice_processing_jobs', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'restrict' }),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  reviewRequired: integer('review_required').notNull().default(0),
}, (table) => [
  uniqueIndex('invoice_processing_order_unique').on(table.orderId),
  check('invoice_processing_values_valid', sql`${table.attempts} >= 0 and ${table.reviewRequired} in (0, 1)`),
]).enableRLS();

/** Invoice line snapshots remain unchanged if a program name or price changes later. */
export const invoiceItems = pgTable(
  'invoice_items',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    invoiceId: integer('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
    programVolumeId: integer('program_volume_id').references(() => programVolumes.id, { onDelete: 'set null' }),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull().default(1),
    unitPriceCents: integer('unit_price_cents').notNull(),
    lineTotalCents: integer('line_total_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('invoice_items_description_length', sql`char_length(${table.description}) between 1 and 240`),
    check('invoice_items_quantity_positive', sql`${table.quantity} > 0`),
    check('invoice_items_unit_price_non_negative', sql`${table.unitPriceCents} >= 0`),
    check('invoice_items_total_matches', sql`${table.lineTotalCents} = ${table.quantity} * ${table.unitPriceCents}`),
    index('invoice_items_invoice_idx').on(table.invoiceId),
  ],
).enableRLS();

/** Immutable administrator evidence for legacy snapshots and resolved extra attempts. */
export const invoicePurchaseReviews = pgTable('invoice_purchase_reviews', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'restrict' }),
  paymentId: integer('payment_id').notNull().references(() => payments.id, { onDelete: 'restrict' }),
  clientName: text('client_name').notNull(),
  clientEmail: text('client_email').notNull(),
  clientPhone: text('client_phone'),
  evidence: text('evidence').notNull(),
  createdByUserId: integer('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex('invoice_purchase_reviews_order_unique').on(table.orderId),
  check('invoice_purchase_reviews_evidence_length', sql`char_length(${table.evidence}) between 10 and 1000`),
]).enableRLS();

/** Request hashes, actor and resulting records make financial admin retries safe and auditable. */
export const invoiceCommands = pgTable('invoice_commands', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  keyHash: text('key_hash').notNull(),
  requestHash: text('request_hash').notNull(),
  action: text('action').notNull(),
  reason: text('reason').notNull(),
  invoiceId: integer('invoice_id').references(() => invoices.id, { onDelete: 'restrict' }),
  editionId: integer('edition_id').references(() => invoiceEditions.id, { onDelete: 'restrict' }),
  orderId: integer('order_id').references(() => orders.id, { onDelete: 'restrict' }),
  createdByUserId: integer('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [uniqueIndex('invoice_commands_key_unique').on(table.keyHash),
  check('invoice_commands_hashes_valid', sql`${table.keyHash} ~ '^[a-f0-9]{64}$' and ${table.requestHash} ~ '^[a-f0-9]{64}$'`),
]).enableRLS();
