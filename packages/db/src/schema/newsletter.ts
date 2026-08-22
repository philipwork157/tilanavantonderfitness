import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const newsletterSubscriberStatusValues = [
  'pending',
  'subscribed',
  'unsubscribed',
  'bounced',
  'complained',
] as const;
export type NewsletterSubscriberStatus = (typeof newsletterSubscriberStatusValues)[number];

export const newsletterSubscribers = pgTable(
  'newsletter_subscribers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    status: text('status').$type<NewsletterSubscriberStatus>().notNull().default('pending'),
    source: text('source').notNull().default('website-footer'),
    privacyPolicyVersion: text('privacy_policy_version').notNull(),
    consentedAt: timestamp('consented_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('newsletter_subscribers_email_unique').on(table.email),
    index('newsletter_subscribers_status_created_at_idx').on(table.status, table.createdAt),
    check('newsletter_subscribers_email_length', sql`char_length(${table.email}) between 3 and 254`),
    check('newsletter_subscribers_source_length', sql`char_length(${table.source}) between 1 and 80`),
    check('newsletter_subscribers_status_value', sql`${table.status} in ('pending', 'subscribed', 'unsubscribed', 'bounced', 'complained')`),
  ],
).enableRLS();

export const newsletterTokenPurposeValues = ['confirmation', 'unsubscribe'] as const;
export type NewsletterTokenPurpose = (typeof newsletterTokenPurposeValues)[number];

export const newsletterTokens = pgTable(
  'newsletter_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriberId: uuid('subscriber_id').notNull().references(() => newsletterSubscribers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    purpose: text('purpose').$type<NewsletterTokenPurpose>().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('newsletter_tokens_hash_unique').on(table.tokenHash),
    index('newsletter_tokens_subscriber_purpose_idx').on(table.subscriberId, table.purpose),
    check('newsletter_tokens_purpose_value', sql`${table.purpose} in ('confirmation', 'unsubscribe')`),
    check('newsletter_tokens_expiry_valid', sql`${table.expiresAt} > ${table.createdAt}`),
  ],
).enableRLS();
