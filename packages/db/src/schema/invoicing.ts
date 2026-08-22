import { sql } from 'drizzle-orm';
import { check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { programVolumes } from './catalog';
import { clients, profiles } from './identity';
import { orders } from './sales';

export const invoiceStatusValues = ['draft', 'issued', 'paid', 'overdue', 'void'] as const;
export type InvoiceStatus = (typeof invoiceStatusValues)[number];

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceNumber: text('invoice_number').notNull(),
    clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
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
    createdByUserId: uuid('created_by_user_id').references(() => profiles.userId, { onDelete: 'set null' }),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('invoices_invoice_number_unique').on(table.invoiceNumber),
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

/** Invoice line snapshots remain unchanged if a program name or price changes later. */
export const invoiceItems = pgTable(
  'invoice_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id').notNull().references(() => invoices.id, { onDelete: 'cascade' }),
    programVolumeId: uuid('program_volume_id').references(() => programVolumes.id, { onDelete: 'set null' }),
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
