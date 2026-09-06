import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const programStatusValues = ['draft', 'published', 'archived'] as const;
export type ProgramStatus = (typeof programStatusValues)[number];

export const programs = pgTable(
  'programs',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status').$type<ProgramStatus>().notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('programs_slug_unique').on(table.slug),
    check('programs_slug_format', sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check('programs_name_length', sql`char_length(${table.name}) between 1 and 120`),
    check('programs_status_value', sql`${table.status} in ('draft', 'published', 'archived')`),
    index('programs_status_idx').on(table.status),
  ],
).enableRLS();

export const programVolumes = pgTable(
  'program_volumes',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    programId: integer('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
    volumeNumber: integer('volume_number').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    currentPriceCents: integer('current_price_cents').notNull(),
    currency: text('currency').notNull().default('ZAR'),
    isPublished: boolean('is_published').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('program_volumes_program_volume_unique').on(table.programId, table.volumeNumber),
    check('program_volumes_volume_number_positive', sql`${table.volumeNumber} > 0`),
    check('program_volumes_name_length', sql`char_length(${table.name}) between 1 and 160`),
    check('program_volumes_price_non_negative', sql`${table.currentPriceCents} >= 0`),
    check('program_volumes_currency_format', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    index('program_volumes_published_idx').on(table.isPublished),
  ],
).enableRLS();

/** Metadata only; the private PDF itself is stored in Cloudflare R2. */
export const programFiles = pgTable(
  'program_files',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    programVolumeId: integer('program_volume_id')
      .notNull()
      .references(() => programVolumes.id, { onDelete: 'cascade' }),
    displayName: text('display_name').notNull(),
    r2Bucket: text('r2_bucket').notNull(),
    r2ObjectKey: text('r2_object_key').notNull(),
    contentType: text('content_type').notNull().default('application/pdf'),
    sizeBytes: integer('size_bytes'),
    version: integer('version').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('program_files_r2_object_unique').on(table.r2Bucket, table.r2ObjectKey),
    check('program_files_display_name_length', sql`char_length(${table.displayName}) between 1 and 200`),
    check('program_files_size_non_negative', sql`${table.sizeBytes} is null or ${table.sizeBytes} >= 0`),
    check('program_files_version_positive', sql`${table.version} > 0`),
    index('program_files_volume_active_idx').on(table.programVolumeId, table.isActive),
  ],
).enableRLS();
