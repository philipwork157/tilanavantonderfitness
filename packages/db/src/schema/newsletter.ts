import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './identity';

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

export const newsletterCampaignStatusValues = ['draft', 'sending', 'sent', 'partially_failed', 'failed'] as const;
export type NewsletterCampaignStatus = (typeof newsletterCampaignStatusValues)[number];

export const newsletterCampaigns = pgTable(
  'newsletter_campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subject: text('subject').notNull(),
    previewText: text('preview_text'),
    blogTitle: text('blog_title').notNull(),
    introduction: text('introduction').notNull(),
    blogUrl: text('blog_url').notNull(),
    status: text('status').$type<NewsletterCampaignStatus>().notNull().default('draft'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.userId, { onDelete: 'set null' }),
    recipientCount: integer('recipient_count').notNull().default(0),
    sentCount: integer('sent_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('newsletter_campaigns_status_created_at_idx').on(table.status, table.createdAt),
    check('newsletter_campaigns_status_value', sql`${table.status} in ('draft', 'sending', 'sent', 'partially_failed', 'failed')`),
    check('newsletter_campaigns_subject_length', sql`char_length(${table.subject}) between 3 and 150`),
    check('newsletter_campaigns_blog_title_length', sql`char_length(${table.blogTitle}) between 2 and 160`),
    check('newsletter_campaigns_blog_url_length', sql`char_length(${table.blogUrl}) between 8 and 500`),
    check('newsletter_campaigns_counts_valid', sql`${table.recipientCount} >= 0 and ${table.sentCount} >= 0 and ${table.failedCount} >= 0`),
  ],
).enableRLS();

export const newsletterDeliveryStatusValues = ['queued', 'sent', 'failed', 'skipped'] as const;
export type NewsletterDeliveryStatus = (typeof newsletterDeliveryStatusValues)[number];

export const newsletterCampaignDeliveries = pgTable(
  'newsletter_campaign_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').notNull().references(() => newsletterCampaigns.id, { onDelete: 'cascade' }),
    subscriberId: uuid('subscriber_id').notNull().references(() => newsletterSubscribers.id, { onDelete: 'restrict' }),
    emailSnapshot: text('email_snapshot').notNull(),
    status: text('status').$type<NewsletterDeliveryStatus>().notNull().default('queued'),
    sesMessageId: text('ses_message_id'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('newsletter_campaign_deliveries_campaign_subscriber_unique').on(table.campaignId, table.subscriberId),
    index('newsletter_campaign_deliveries_campaign_status_idx').on(table.campaignId, table.status),
    index('newsletter_campaign_deliveries_subscriber_idx').on(table.subscriberId),
    check('newsletter_campaign_deliveries_status_value', sql`${table.status} in ('queued', 'sent', 'failed', 'skipped')`),
    check('newsletter_campaign_deliveries_email_length', sql`char_length(${table.emailSnapshot}) between 3 and 254`),
    check('newsletter_campaign_deliveries_attempts_valid', sql`${table.attemptCount} >= 0`),
  ],
).enableRLS();

export const newsletterCampaignTestStatusValues = ['sent', 'failed'] as const;
export type NewsletterCampaignTestStatus = (typeof newsletterCampaignTestStatusValues)[number];

export const newsletterCampaignTestDeliveries = pgTable(
  'newsletter_campaign_test_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').notNull().references(() => newsletterCampaigns.id, { onDelete: 'cascade' }),
    recipientSnapshot: text('recipient_snapshot').notNull(),
    status: text('status').$type<NewsletterCampaignTestStatus>().notNull(),
    sesMessageId: text('ses_message_id'),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('newsletter_campaign_test_deliveries_campaign_created_idx').on(table.campaignId, table.createdAt),
    check('newsletter_campaign_test_deliveries_status_value', sql`${table.status} in ('sent', 'failed')`),
    check('newsletter_campaign_test_deliveries_recipient_length', sql`char_length(${table.recipientSnapshot}) between 3 and 254`),
  ],
).enableRLS();
