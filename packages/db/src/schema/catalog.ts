import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './identity';

export const programStatusValues = ['draft', 'published', 'archived'] as const;
export type ProgramStatus = (typeof programStatusValues)[number];

export const programUploadStatusValues = ['pending', 'ready', 'failed'] as const;
export type ProgramUploadStatus = (typeof programUploadStatusValues)[number];

export const programMediaKindValues = ['cover'] as const;
export type ProgramMediaKind = (typeof programMediaKindValues)[number];

export const programAuditEntityTypeValues = ['program', 'program_volume', 'program_media', 'program_file'] as const;
export type ProgramAuditEntityType = (typeof programAuditEntityTypeValues)[number];

export const programs = pgTable(
  'programs',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    cardLabel: text('card_label'),
    headline: text('headline'),
    description: text('description'),
    accent: text('accent'),
    sortOrder: integer('sort_order').notNull().default(0),
    status: text('status').$type<ProgramStatus>().notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    updatedByUserId: integer('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('programs_slug_unique').on(table.slug),
    check('programs_slug_format', sql`${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`),
    check('programs_name_length', sql`char_length(${table.name}) between 1 and 120`),
    check(
      'programs_card_label_length',
      sql`${table.cardLabel} is null or char_length(${table.cardLabel}) between 1 and 120`,
    ),
    check(
      'programs_headline_length',
      sql`${table.headline} is null or char_length(${table.headline}) between 1 and 180`,
    ),
    check(
      'programs_accent_format',
      sql`${table.accent} is null or (${table.accent} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(${table.accent}) <= 40)`,
    ),
    check('programs_sort_order_non_negative', sql`${table.sortOrder} >= 0`),
    check('programs_status_value', sql`${table.status} in ('draft', 'published', 'archived')`),
    index('programs_status_idx').on(table.status),
    index('programs_catalogue_order_idx').on(table.status, table.sortOrder, table.name),
  ],
).enableRLS();

export const programVolumes = pgTable(
  'program_volumes',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    programId: integer('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
    slug: text('slug'),
    volumeNumber: integer('volume_number').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    currentPriceCents: integer('current_price_cents').notNull(),
    currency: text('currency').notNull().default('ZAR'),
    sortOrder: integer('sort_order').notNull().default(0),
    isPublished: boolean('is_published').notNull().default(false),
    createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    updatedByUserId: integer('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('program_volumes_program_volume_unique').on(table.programId, table.volumeNumber),
    uniqueIndex('program_volumes_slug_unique').on(table.slug),
    check(
      'program_volumes_slug_format',
      sql`${table.slug} is null or ${table.slug} ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'`,
    ),
    check('program_volumes_volume_number_positive', sql`${table.volumeNumber} > 0`),
    check('program_volumes_name_length', sql`char_length(${table.name}) between 1 and 160`),
    check('program_volumes_price_non_negative', sql`${table.currentPriceCents} >= 0`),
    check('program_volumes_currency_format', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check('program_volumes_sort_order_non_negative', sql`${table.sortOrder} >= 0`),
    index('program_volumes_published_idx').on(table.isPublished),
    index('program_volumes_program_published_order_idx').on(table.programId, table.isPublished, table.sortOrder),
  ],
).enableRLS();

/** Public program imagery stored in the environment's public-media R2 bucket. */
export const programMedia = pgTable(
  'program_media',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    programId: integer('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<ProgramMediaKind>().notNull().default('cover'),
    displayName: text('display_name').notNull(),
    altText: text('alt_text').notNull(),
    r2Bucket: text('r2_bucket').notNull(),
    r2ObjectKey: text('r2_object_key').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes'),
    width: integer('width'),
    height: integer('height'),
    version: integer('version').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
    uploadStatus: text('upload_status').$type<ProgramUploadStatus>().notNull().default('pending'),
    isActive: boolean('is_active').notNull().default(true),
    createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('program_media_r2_object_unique').on(table.r2Bucket, table.r2ObjectKey),
    uniqueIndex('program_media_program_ready_cover_unique')
      .on(table.programId, table.kind)
      .where(sql`${table.kind} = 'cover' and ${table.uploadStatus} = 'ready' and ${table.isActive} = true`),
    check('program_media_kind_value', sql`${table.kind} in ('cover')`),
    check('program_media_display_name_length', sql`char_length(${table.displayName}) between 1 and 200`),
    check('program_media_alt_text_length', sql`char_length(${table.altText}) between 1 and 300`),
    check('program_media_bucket_length', sql`char_length(${table.r2Bucket}) between 1 and 100`),
    check('program_media_object_key_length', sql`char_length(${table.r2ObjectKey}) between 1 and 1024`),
    check('program_media_content_type_length', sql`char_length(${table.contentType}) between 1 and 120`),
    check('program_media_size_non_negative', sql`${table.sizeBytes} is null or ${table.sizeBytes} >= 0`),
    check(
      'program_media_dimensions_valid',
      sql`(${table.width} is null and ${table.height} is null) or (${table.width} is not null and ${table.height} is not null and ${table.width} > 0 and ${table.height} > 0)`,
    ),
    check('program_media_version_positive', sql`${table.version} > 0`),
    check('program_media_sort_order_non_negative', sql`${table.sortOrder} >= 0`),
    check('program_media_upload_status_value', sql`${table.uploadStatus} in ('pending', 'ready', 'failed')`),
    index('program_media_program_status_order_idx').on(
      table.programId,
      table.uploadStatus,
      table.isActive,
      table.sortOrder,
    ),
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
    originalFilename: text('original_filename'),
    r2Bucket: text('r2_bucket').notNull(),
    r2ObjectKey: text('r2_object_key').notNull(),
    contentType: text('content_type').notNull().default('application/pdf'),
    sizeBytes: integer('size_bytes'),
    uploadStatus: text('upload_status').$type<ProgramUploadStatus>().notNull().default('pending'),
    etag: text('etag'),
    version: integer('version').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    uploadedByUserId: integer('uploaded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('program_files_r2_object_unique').on(table.r2Bucket, table.r2ObjectKey),
    check('program_files_display_name_length', sql`char_length(${table.displayName}) between 1 and 200`),
    check(
      'program_files_original_filename_length',
      sql`${table.originalFilename} is null or char_length(${table.originalFilename}) between 1 and 255`,
    ),
    check('program_files_bucket_length', sql`char_length(${table.r2Bucket}) between 1 and 100`),
    check('program_files_object_key_length', sql`char_length(${table.r2ObjectKey}) between 1 and 1024`),
    check('program_files_content_type_length', sql`char_length(${table.contentType}) between 1 and 120`),
    check('program_files_size_non_negative', sql`${table.sizeBytes} is null or ${table.sizeBytes} >= 0`),
    check('program_files_upload_status_value', sql`${table.uploadStatus} in ('pending', 'ready', 'failed')`),
    check('program_files_etag_length', sql`${table.etag} is null or char_length(${table.etag}) between 1 and 200`),
    check('program_files_version_positive', sql`${table.version} > 0`),
    check('program_files_sort_order_non_negative', sql`${table.sortOrder} >= 0`),
    index('program_files_volume_ready_active_idx').on(
      table.programVolumeId,
      table.uploadStatus,
      table.isActive,
      table.sortOrder,
    ),
  ],
).enableRLS();

/** Append-only catalogue change history. Services must never store secrets or signed URLs here. */
export const programAuditEvents = pgTable(
  'program_audit_events',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    entityType: text('entity_type').$type<ProgramAuditEntityType>().notNull(),
    entityId: integer('entity_id').notNull(),
    action: text('action').notNull(),
    changeSummary: jsonb('change_summary').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'program_audit_events_entity_type_value',
      sql`${table.entityType} in ('program', 'program_volume', 'program_media', 'program_file')`,
    ),
    check('program_audit_events_entity_id_positive', sql`${table.entityId} > 0`),
    check(
      'program_audit_events_action_format',
      sql`${table.action} ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$' and char_length(${table.action}) <= 80`,
    ),
    check('program_audit_events_summary_object', sql`jsonb_typeof(${table.changeSummary}) = 'object'`),
    index('program_audit_events_entity_created_at_idx').on(table.entityType, table.entityId, table.createdAt),
    index('program_audit_events_user_created_at_idx').on(table.userId, table.createdAt),
  ],
).enableRLS();
