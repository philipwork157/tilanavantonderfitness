import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const genderValues = ['female', 'male', 'non-binary', 'other', 'prefer-not-to-say'] as const;
export type Gender = (typeof genderValues)[number];

export const userRoleValues = ['admin', 'customer', 'staff'] as const;
export type UserRole = (typeof userRoleValues)[number];

/**
 * Application-owned data for a Supabase Auth user.
 *
 * `userId` is the matching `auth.users.id`. The cross-schema foreign key is
 * added in the reviewed SQL migration because Supabase owns the auth schema.
 */
export const profiles = pgTable(
  'profiles',
  {
    userId: uuid('user_id').primaryKey(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    gender: text('gender').$type<Gender>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('profiles_first_name_length', sql`char_length(${table.firstName}) between 1 and 100`),
    check('profiles_last_name_length', sql`char_length(${table.lastName}) between 1 and 100`),
    check('profiles_email_length', sql`char_length(${table.email}) between 3 and 254`),
    check(
      'profiles_gender_value',
      sql`${table.gender} is null or ${table.gender} in ('female', 'male', 'non-binary', 'other', 'prefer-not-to-say')`,
    ),
    uniqueIndex('profiles_email_unique').on(sql`lower(${table.email})`),
  ],
).enableRLS();

/** Roles are separate from profiles so privileges never come from editable profile fields. */
export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id').notNull().references(() => profiles.userId, { onDelete: 'cascade' }),
    role: text('role').$type<UserRole>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.role] }),
    check('user_roles_role_value', sql`${table.role} in ('admin', 'customer', 'staff')`),
    index('user_roles_role_idx').on(table.role),
  ],
).enableRLS();

/**
 * Business/customer record. It can exist before an invitation is accepted;
 * linking `userId` later gives the customer portal access to this record.
 */
export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => profiles.userId, { onDelete: 'set null' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    gender: text('gender').$type<Gender>(),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.userId, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('clients_first_name_length', sql`char_length(${table.firstName}) between 1 and 100`),
    check('clients_last_name_length', sql`char_length(${table.lastName}) between 1 and 100`),
    check('clients_email_length', sql`char_length(${table.email}) between 3 and 254`),
    check(
      'clients_gender_value',
      sql`${table.gender} is null or ${table.gender} in ('female', 'male', 'non-binary', 'other', 'prefer-not-to-say')`,
    ),
    uniqueIndex('clients_user_id_unique').on(table.userId),
    index('clients_email_idx').on(sql`lower(${table.email})`),
    index('clients_created_at_idx').on(table.createdAt),
  ],
).enableRLS();
