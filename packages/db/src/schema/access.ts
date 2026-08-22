import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { programVolumes } from './catalog';
import { clients, profiles } from './identity';
import { orderItems } from './sales';

export const accessSourceValues = ['purchase', 'manual', 'promotion'] as const;
export type AccessSource = (typeof accessSourceValues)[number];

export const accessStatusValues = ['active', 'revoked', 'expired'] as const;
export type AccessStatus = (typeof accessStatusValues)[number];

/** Entitlement checked before the API returns a private R2 download. */
export const programAccess = pgTable(
  'program_access',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
    programVolumeId: uuid('program_volume_id')
      .notNull()
      .references(() => programVolumes.id, { onDelete: 'restrict' }),
    orderItemId: uuid('order_item_id').references(() => orderItems.id, { onDelete: 'set null' }),
    source: text('source').$type<AccessSource>().notNull(),
    status: text('status').$type<AccessStatus>().notNull().default('active'),
    grantedByUserId: uuid('granted_by_user_id').references(() => profiles.userId, { onDelete: 'set null' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('program_access_client_volume_active_unique')
      .on(table.clientId, table.programVolumeId)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex('program_access_order_item_unique').on(table.orderItemId),
    check('program_access_source_value', sql`${table.source} in ('purchase', 'manual', 'promotion')`),
    check('program_access_status_value', sql`${table.status} in ('active', 'revoked', 'expired')`),
    check('program_access_dates_valid', sql`${table.expiresAt} is null or ${table.expiresAt} > ${table.startsAt}`),
    index('program_access_client_status_idx').on(table.clientId, table.status),
    index('program_access_volume_status_idx').on(table.programVolumeId, table.status),
  ],
).enableRLS();
