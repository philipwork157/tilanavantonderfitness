import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
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

export const INQUIRY_STATUSES = ['new', 'replied', 'archived'] as const;

/** Messages sent through the website contact form. */
export const inquiries = pgTable('inquiries', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  // Option key the visitor picked (e.g. 'move', 'one-on-one'). Becomes a
  // program reference once programs live in the database.
  interest: text('interest').notNull(),
  // The label exactly as shown to the visitor, kept even if options change.
  interestLabel: text('interest_label').notNull(),
  message: text('message').notNull(),
  // When the visitor accepted the privacy policy for this enquiry.
  privacyAcceptedAt: timestamp('privacy_accepted_at', { withTimezone: true }).notNull(),
  status: text('status', { enum: INQUIRY_STATUSES }).notNull().default('new'),
  // Email notification to Tilana. A failed email never loses the enquiry.
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
  notificationError: text('notification_error'),
  ...timestamps,
}, table => [
  check('inquiries_status_valid', sql`${table.status} in ('new', 'replied', 'archived')`),
  index('inquiries_created_at_idx').on(table.createdAt.desc()),
]).enableRLS();

export const BLOG_POST_STATUSES = ['draft', 'published'] as const;

/**
 * Blog posts written in the admin. The body is Markdown (raw HTML is never
 * rendered). The signature and "Please note" are part of the website template.
 */
export const blogPosts = pgTable('blog_posts', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  excerpt: text('excerpt').notNull().default(''),
  category: text('category').notNull().default('Nurturance'),
  bodyMarkdown: text('body_markdown').notNull().default(''),
  // Object path inside the public "blog-images" storage bucket.
  coverImagePath: text('cover_image_path'),
  coverImageAlt: text('cover_image_alt'),
  coverImageWidth: integer('cover_image_width'),
  coverImageHeight: integer('cover_image_height'),
  // Optional closing sentence shown above "With love, Tilana".
  closingLine: text('closing_line'),
  // Optional highlighted quote (e.g. a Bible verse) and its source.
  quoteText: text('quote_text'),
  quoteCitation: text('quote_citation'),
  status: text('status', { enum: BLOG_POST_STATUSES }).notNull().default('draft'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdBy: bigint('created_by', { mode: 'number' }).references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
}, table => [
  check('blog_posts_status_valid', sql`${table.status} in ('draft', 'published')`),
  check('blog_posts_slug_format', sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  check('blog_posts_published_has_date', sql`${table.status} <> 'published' or ${table.publishedAt} is not null`),
  index('blog_posts_status_published_idx').on(table.status, table.publishedAt.desc()),
]).enableRLS();

export const NEWSLETTER_SUBSCRIBER_STATUSES = ['pending', 'subscribed', 'unsubscribed', 'bounced', 'complained'] as const;

/**
 * Newsletter subscribers (double opt-in). Only `subscribed` people receive
 * campaigns. `bounced` and `complained` come from Amazon SES and are never
 * emailed again unless the person subscribes and confirms again.
 */
export const newsletterSubscribers = pgTable('newsletter_subscribers', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  email: text('email').notNull().unique(),
  status: text('status', { enum: NEWSLETTER_SUBSCRIBER_STATUSES }).notNull().default('pending'),
  // Where the sign-up came from, e.g. 'website-footer'.
  source: text('source').notNull(),
  // When the person ticked "I agree to receive occasional emails".
  consentedAt: timestamp('consented_at', { withTimezone: true }).notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  unsubscribedAt: timestamp('unsubscribed_at', { withTimezone: true }),
  // Bounce or complaint reported by SES, with its details.
  suppressedAt: timestamp('suppressed_at', { withTimezone: true }),
  suppressionReason: text('suppression_reason'),
  // SHA-256 of the confirmation link token (the token itself is only emailed).
  confirmationTokenHash: text('confirmation_token_hash').unique(),
  confirmationExpiresAt: timestamp('confirmation_expires_at', { withTimezone: true }),
  confirmationSentAt: timestamp('confirmation_sent_at', { withTimezone: true }),
  // Secret used in every unsubscribe link. It can only unsubscribe this person.
  unsubscribeToken: text('unsubscribe_token').notNull().unique(),
  ...timestamps,
}, table => [
  check('newsletter_subscribers_email_lowercase', sql`${table.email} = lower(${table.email})`),
  check('newsletter_subscribers_status_valid', sql`${table.status} in ('pending', 'subscribed', 'unsubscribed', 'bounced', 'complained')`),
  index('newsletter_subscribers_status_idx').on(table.status),
]).enableRLS();

export const NEWSLETTER_CAMPAIGN_STATUSES = ['draft', 'sending', 'paused', 'sent'] as const;

/** A newsletter email that shares one blog post with all subscribers. */
export const newsletterCampaigns = pgTable('newsletter_campaigns', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  blogPostId: bigint('blog_post_id', { mode: 'number' }).references(() => blogPosts.id, { onDelete: 'set null' }),
  subject: text('subject').notNull(),
  // Short line shown next to the subject in most inboxes.
  previewText: text('preview_text').notNull().default(''),
  // Optional personal note from Tilana above the blog post.
  introduction: text('introduction').notNull().default(''),
  status: text('status', { enum: NEWSLETTER_CAMPAIGN_STATUSES }).notNull().default('draft'),
  // Set when a test email is sent; cleared by any edit. Sending needs a test.
  testSentAt: timestamp('test_sent_at', { withTimezone: true }),
  // Why sending stopped (paused), e.g. an Amazon SES account problem.
  pauseReason: text('pause_reason'),
  recipientCount: integer('recipient_count').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdBy: bigint('created_by', { mode: 'number' }).references(() => users.id, { onDelete: 'set null' }),
  sentBy: bigint('sent_by', { mode: 'number' }).references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
}, table => [
  check('newsletter_campaigns_status_valid', sql`${table.status} in ('draft', 'sending', 'paused', 'sent')`),
  index('newsletter_campaigns_created_at_idx').on(table.createdAt.desc()),
]).enableRLS();

export const NEWSLETTER_DELIVERY_STATUSES = ['queued', 'sending', 'sent', 'skipped', 'failed', 'bounced', 'complained'] as const;

/** One row per subscriber per campaign, so nobody is emailed twice. */
export const newsletterDeliveries = pgTable('newsletter_deliveries', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  campaignId: bigint('campaign_id', { mode: 'number' }).notNull()
    .references(() => newsletterCampaigns.id, { onDelete: 'cascade' }),
  subscriberId: bigint('subscriber_id', { mode: 'number' })
    .references(() => newsletterSubscribers.id, { onDelete: 'set null' }),
  // The address at the time of sending.
  email: text('email').notNull(),
  status: text('status', { enum: NEWSLETTER_DELIVERY_STATUSES }).notNull().default('queued'),
  // Amazon SES message id, used to match bounce and complaint reports.
  sesMessageId: text('ses_message_id'),
  error: text('error'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  ...timestamps,
}, table => [
  check('newsletter_deliveries_status_valid', sql`${table.status} in ('queued', 'sending', 'sent', 'skipped', 'failed', 'bounced', 'complained')`),
  uniqueIndex('newsletter_deliveries_campaign_subscriber_unique').on(table.campaignId, table.subscriberId),
  index('newsletter_deliveries_campaign_status_idx').on(table.campaignId, table.status),
  index('newsletter_deliveries_ses_message_idx').on(table.sesMessageId),
]).enableRLS();

export type User = typeof users.$inferSelect;
export type BlogPost = typeof blogPosts.$inferSelect;
export type Inquiry = typeof inquiries.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type NewsletterCampaign = typeof newsletterCampaigns.$inferSelect;
export type NewsletterDelivery = typeof newsletterDeliveries.$inferSelect;
