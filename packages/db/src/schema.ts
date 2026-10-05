import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// Row level security is enabled on every table with no policies, so Supabase's
// public API (anon/authenticated keys) cannot read or write them. Only the
// server, using the database connection string, has access.

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
    .$onUpdate(() => new Date()),
};

/** Everyone who can sign in: admins, staff and (later) customers. */
export const users = pgTable('users', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  // Supabase Auth user. Empty until the person signs in for the first time,
  // then linked by their confirmed email address.
  authUserId: uuid('auth_user_id').unique(),
  email: text('email').notNull().unique(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  isActive: boolean('is_active').notNull().default(true),
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
  ...timestamps,
}, table => [
  // Emails are stored lowercase so the unique constraint is case-insensitive.
  check('users_email_lowercase', sql`${table.email} = lower(${table.email})`),
]).enableRLS();

export const roles = pgTable('roles', {
  id: smallint('id').primaryKey().generatedAlwaysAsIdentity(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const userRoles = pgTable('user_roles', {
  userId: bigint('user_id', { mode: 'number' }).notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  roleId: smallint('role_id').notNull()
    .references(() => roles.id, { onDelete: 'restrict' }),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.userId, table.roleId] }),
  index('user_roles_role_id_idx').on(table.roleId),
]).enableRLS();

export type User = typeof users.$inferSelect;
export type Role = typeof roles.$inferSelect;
