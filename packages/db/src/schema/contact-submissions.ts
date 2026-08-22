import type { ContactInterest } from '@tilana/contracts/contact';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const contactStatusValues = ['new', 'read', 'replied', 'archived'] as const;

export type ContactStatus = (typeof contactStatusValues)[number];

export const contactSubmissions = pgTable(
  'contact_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fullName: text('full_name').notNull(),
    email: text('email').notNull(),
    interest: text('interest').$type<ContactInterest>().notNull(),
    message: text('message').notNull(),
    status: text('status').$type<ContactStatus>().notNull().default('new'),
    source: text('source').notNull().default('website'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('contact_submissions_full_name_length', sql`char_length(${table.fullName}) between 2 and 100`),
    check('contact_submissions_email_length', sql`char_length(${table.email}) between 3 and 254`),
    check('contact_submissions_message_length', sql`char_length(${table.message}) between 10 and 3000`),
    check('contact_submissions_interest_value', sql`${table.interest} in ('strong', 'move', 'nourish', 'reconnect', 'one-on-one', 'general')`),
    check('contact_submissions_status_value', sql`${table.status} in ('new', 'read', 'replied', 'archived')`),
    index('contact_submissions_status_created_at_idx').on(table.status, table.createdAt),
    index('contact_submissions_email_idx').on(table.email),
  ],
).enableRLS();
