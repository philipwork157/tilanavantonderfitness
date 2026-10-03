import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, pgTable, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { programFiles } from './catalog';
import { orderItems } from './sales';

/** The verified PDF edition owed by a checkout. Replacements do not change its purchase email. */
export const orderItemFiles = pgTable('order_item_files', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  orderItemId: integer('order_item_id').notNull(),
  clientId: integer('client_id').notNull(),
  programVolumeId: integer('program_volume_id').notNull(),
  programFileId: integer('program_file_id').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  contentSha256: varchar('content_sha256', { length: 64 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  foreignKey({ name: 'order_item_files_purchase_fk', columns: [table.orderItemId, table.clientId, table.programVolumeId],
    foreignColumns: [orderItems.id, orderItems.clientId, orderItems.programVolumeId] }).onDelete('restrict'),
  foreignKey({ name: 'order_item_files_edition_fk', columns: [table.programFileId, table.programVolumeId],
    foreignColumns: [programFiles.id, programFiles.programVolumeId] }).onDelete('restrict'),
  uniqueIndex('order_item_files_item_file_unique').on(table.orderItemId, table.programFileId),
  index('order_item_files_file_idx').on(table.programFileId),
  check('order_item_files_size_positive', sql`${table.sizeBytes} > 0`),
  check('order_item_files_digest_format', sql`${table.contentSha256} ~ '^[a-f0-9]{64}$'`),
]).enableRLS();
