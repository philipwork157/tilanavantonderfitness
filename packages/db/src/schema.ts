import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
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

export const RECIPE_STATUSES = ['draft', 'published'] as const;

/** One ingredient line; the amount is for the recipe's stated servings. */
export interface RecipeIngredientData { qty?: number; unit?: string; item: string; note?: string }

/**
 * Kitchen recipes for the website's /kitchen pages. Nutrition is per serving.
 * The photo lives in the public "blog-images" bucket under recipes/; without
 * one the website draws `icon` on a `tone` coloured card.
 */
export const recipes = pgTable('recipes', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  meal: text('meal').notNull().default('Dinner'),
  prepMinutes: integer('prep_minutes').notNull().default(0),
  cookMinutes: integer('cook_minutes').notNull().default(0),
  servings: integer('servings').notNull().default(2),
  kcal: integer('kcal').notNull().default(0),
  proteinG: integer('protein_g').notNull().default(0),
  carbsG: integer('carbs_g').notNull().default(0),
  fatG: integer('fat_g').notNull().default(0),
  // One or two sentences: why the protein in this meal matters (or how to add more).
  proteinNote: text('protein_note').notNull().default(''),
  ingredients: jsonb('ingredients').$type<RecipeIngredientData[]>().notNull().default(sql`'[]'::jsonb`),
  steps: jsonb('steps').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  tags: jsonb('tags').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  // "Tilana's notes" under the method (Markdown).
  notesMarkdown: text('notes_markdown').notNull().default(''),
  tone: text('tone').notNull().default('sand'),
  icon: text('icon').notNull().default('plate'),
  imagePath: text('image_path'),
  imageAlt: text('image_alt'),
  imageWidth: integer('image_width'),
  imageHeight: integer('image_height'),
  // The blog post this recipe comes from (linked on the recipe page while that post is published).
  blogPostId: bigint('blog_post_id', { mode: 'number' }).references(() => blogPosts.id, { onDelete: 'set null' }),
  // A simple version of a meal from the blog, until Tilana adds her own recipe and photo.
  sample: boolean('sample').notNull().default(false),
  status: text('status', { enum: RECIPE_STATUSES }).notNull().default('draft'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdBy: bigint('created_by', { mode: 'number' }).references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
}, table => [
  check('recipes_status_valid', sql`${table.status} in ('draft', 'published')`),
  check('recipes_slug_format', sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  check('recipes_published_has_date', sql`${table.status} <> 'published' or ${table.publishedAt} is not null`),
  check('recipes_meal_valid', sql`${table.meal} in ('Breakfast', 'Lunch', 'Dinner', 'Snack', 'Training fuel')`),
  check('recipes_tone_valid', sql`${table.tone} in ('terracotta', 'sage', 'sand', 'white', 'caramel')`),
  check('recipes_icon_valid', sql`${table.icon} in ('plate', 'bowl', 'toast', 'egg', 'pot', 'steak')`),
  check('recipes_servings_positive', sql`${table.servings} > 0`),
  check('recipes_numbers_not_negative', sql`least(${table.prepMinutes}, ${table.cookMinutes}, ${table.kcal}, ${table.proteinG}, ${table.carbsG}, ${table.fatG}) >= 0`),
  index('recipes_status_published_idx').on(table.status, table.publishedAt.desc()),
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

export const PROGRAM_TONES = ['terracotta', 'sage', 'sand', 'white', 'caramel'] as const;
export const PROGRAM_ILLUSTRATIONS = ['barbell', 'breath', 'plate'] as const;
export const PROGRAM_SERIES = ['strength', 'focus'] as const;

/**
 * The sneak peek made from a program's PDF: the cover, plus a few inside pages
 * blurred, as WebP images in the public Supabase Storage bucket
 * `program-previews`. `fileVersion` says which PDF they were made from.
 */
export interface ProgramPreviewData {
  fileVersion: number;
  pageCount: number;
  pages: { path: string; page: number; width: number; height: number; blurred: boolean }[];
}

/**
 * A collection of programs: "Volume 1", "Volume 2". Tilana switches a whole
 * volume on or off for the website; its programs only show while it is active.
 */
export const volumes = pgTable('volumes', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  number: smallint('number').notNull().unique(),
  // "Volume 1"; shown in the admin and on the program stamps.
  name: text('name').notNull(),
  // Its programs are on the website while this is on.
  isActive: boolean('is_active').notNull().default(false),
  createdBy: bigint('created_by', { mode: 'number' }).references(() => users.id, { onDelete: 'set null' }),
  updatedBy: bigint('updated_by', { mode: 'number' }).references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
}, table => [
  check('volumes_number_range', sql`${table.number} between 1 and 99`),
  check('volumes_name_length', sql`char_length(${table.name}) between 1 and 60`),
]).enableRLS();

/**
 * A program in a volume (Beginner, Reconnect, ...): what the website shows and
 * what people buy, with its price and the private PDF emailed after payment.
 * It is on the website when its volume is active and it has a PDF.
 * `file_path` is the object key in the private Cloudflare R2 bucket
 * (R2_PRIVATE_PROGRAM_BUCKET); only the server can read it.
 */
export const programs = pgTable('programs', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  // Public identifier used by the basket, checkout and page anchors, e.g. "beginner-volume-1".
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  // Headline on the program page, e.g. "Build a confident foundation."
  title: text('title').notNull().default(''),
  // One or two sentences for the program cards.
  summary: text('summary').notNull().default(''),
  description: text('description').notNull().default(''),
  // Who it is for, e.g. "New or returning".
  audience: text('audience').notNull().default(''),
  tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
  // "What's inside": up to 4 short lines next to the PDF pictures on the website.
  highlights: text('highlights').array().notNull().default(sql`'{}'::text[]`),
  tone: text('tone', { enum: PROGRAM_TONES }).notNull().default('sand'),
  // Which website illustration to draw (the barbell uses `step` plates).
  illustration: text('illustration', { enum: PROGRAM_ILLUSTRATIONS }).notNull().default('barbell'),
  // "The strength series" (steps 1 to 3) or a stand-alone focus program.
  series: text('series', { enum: PROGRAM_SERIES }).notNull().default('focus'),
  step: smallint('step'),
  // Short label on the colour panel, e.g. "Start here" or "Pelvic floor".
  marker: text('marker').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  // Tilana's on/off switch for this program alone. It is on the website only
  // when this is on, its volume is on and it has a PDF.
  isActive: boolean('is_active').notNull().default(true),
  volumeId: bigint('volume_id', { mode: 'number' }).notNull().references(() => volumes.id, { onDelete: 'restrict' }),
  priceCents: integer('price_cents').notNull(),
  currency: text('currency').notNull().default('ZAR'),
  filePath: text('file_path'),
  fileName: text('file_name'),
  fileSizeBytes: integer('file_size_bytes'),
  fileSha256: text('file_sha256'),
  fileVersion: integer('file_version').notNull().default(0),
  fileUploadedAt: timestamp('file_uploaded_at', { withTimezone: true }),
  fileUploadedBy: bigint('file_uploaded_by', { mode: 'number' }).references(() => users.id, { onDelete: 'set null' }),
  // Sneak peek images made automatically from the PDF; null until made.
  preview: jsonb('preview').$type<ProgramPreviewData>(),
  createdBy: bigint('created_by', { mode: 'number' }).references(() => users.id, { onDelete: 'set null' }),
  updatedBy: bigint('updated_by', { mode: 'number' }).references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
}, table => [
  check('programs_slug_format', sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  check('programs_name_length', sql`char_length(${table.name}) between 1 and 60`),
  check('programs_tone_valid', sql`${table.tone} in ('terracotta', 'sage', 'sand', 'white', 'caramel')`),
  check('programs_illustration_valid', sql`${table.illustration} in ('barbell', 'breath', 'plate')`),
  check('programs_series_valid', sql`${table.series} in ('strength', 'focus')`),
  check('programs_step_matches_series', sql`(${table.series} = 'strength' and ${table.step} is not null and ${table.step} between 1 and 3) or (${table.series} = 'focus' and ${table.step} is null)`),
  check('programs_tags_count', sql`coalesce(array_length(${table.tags}, 1), 0) <= 6`),
  check('programs_highlights_count', sql`coalesce(array_length(${table.highlights}, 1), 0) <= 4`),
  check('programs_sort_order_non_negative', sql`${table.sortOrder} >= 0`),
  check('programs_price_valid', sql`${table.priceCents} between 100 and 10000000`),
  check('programs_currency_valid', sql`${table.currency} = 'ZAR'`),
  check('programs_file_complete', sql`(${table.filePath} is null) = (${table.fileName} is null)
    and (${table.filePath} is null) = (${table.fileSizeBytes} is null)
    and (${table.filePath} is null) = (${table.fileSha256} is null)
    and (${table.filePath} is null) = (${table.fileUploadedAt} is null)`),
  index('programs_volume_order_idx').on(table.volumeId, table.sortOrder),
]).enableRLS();

export const ORDER_STATUSES = ['pending', 'paid', 'failed', 'abandoned', 'refunded'] as const;
export const ORDER_DELIVERY_STATUSES = ['pending', 'sent', 'failed'] as const;
/** A refund asked from Paystack: pending until Paystack confirms it (then the order is refunded) or it fails. */
export const ORDER_REFUND_STATUSES = ['pending', 'processed', 'failed'] as const;

/**
 * A checkout. Created as `pending` before the buyer goes to Paystack; becomes
 * `paid` only after the server has verified the payment with Paystack
 * (status, amount, currency and test/live mode). The PDFs are emailed once.
 */
export const orders = pgTable('orders', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  // Shown to the buyer and in emails, e.g. "TV-7K4Q9P".
  orderNumber: text('order_number').notNull().unique(),
  // The Paystack transaction reference we generate.
  reference: text('reference').notNull().unique(),
  // The browser's checkout attempt: a retry with the same key reuses this order.
  idempotencyKey: text('idempotency_key').notNull().unique(),
  status: text('status', { enum: ORDER_STATUSES }).notNull().default('pending'),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  // Stored lowercase.
  email: text('email').notNull(),
  phone: text('phone').notNull().default(''),
  totalCents: integer('total_cents').notNull(),
  currency: text('currency').notNull().default('ZAR'),
  // Paystack test or live mode at the time of checkout.
  paymentMode: text('payment_mode', { enum: ['test', 'live'] }).notNull(),
  authorizationUrl: text('authorization_url'),
  paystackTransactionId: text('paystack_transaction_id'),
  paymentChannel: text('payment_channel'),
  // Paystack's fee for this payment, in cents, as Paystack reported it (null until known).
  feeCents: integer('fee_cents'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  deliveryStatus: text('delivery_status', { enum: ORDER_DELIVERY_STATUSES }).notNull().default('pending'),
  deliveryError: text('delivery_error'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  // SES message ids of the latest PDF emails, so a bounce report can find the order.
  deliveryMessageIds: text('delivery_message_ids').array().notNull().default(sql`'{}'::text[]`),
  // Background checks: how often this order was re-verified with Paystack, and when.
  checkCount: integer('check_count').notNull().default(0),
  lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
  // PDF emails tried so far (the background job retries a few times).
  deliveryAttempts: integer('delivery_attempts').notNull().default(0),
  // When Tilana's "New sale" email went out, so it is sent exactly once.
  saleNotifiedAt: timestamp('sale_notified_at', { withTimezone: true }),
  // Set when a person must look at the order (payment did not match, a dispute).
  reviewNote: text('review_note'),
  // When a person marked it as checked ("Mark as checked"): a mismatched payment is then not flagged again.
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  refundStatus: text('refund_status', { enum: ORDER_REFUND_STATUSES }),
  refundReason: text('refund_reason'),
  paystackRefundId: text('paystack_refund_id'),
  refundRequestedAt: timestamp('refund_requested_at', { withTimezone: true }),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),
  ...timestamps,
}, table => [
  check('orders_status_valid', sql`${table.status} in ('pending', 'paid', 'failed', 'abandoned', 'refunded')`),
  check('orders_refund_status_valid', sql`${table.refundStatus} is null or ${table.refundStatus} in ('pending', 'processed', 'failed')`),
  check('orders_refunded_has_date', sql`${table.status} <> 'refunded' or ${table.refundedAt} is not null`),
  check('orders_delivery_status_valid', sql`${table.deliveryStatus} in ('pending', 'sent', 'failed')`),
  check('orders_payment_mode_valid', sql`${table.paymentMode} in ('test', 'live')`),
  check('orders_total_valid', sql`${table.totalCents} > 0`),
  check('orders_currency_valid', sql`${table.currency} = 'ZAR'`),
  check('orders_paid_has_date', sql`${table.status} <> 'paid' or ${table.paidAt} is not null`),
  index('orders_status_created_idx').on(table.status, table.createdAt),
  index('orders_paid_at_idx').on(table.paidAt),
]).enableRLS();

/** What was bought, with the name and price at the time of sale. */
export const orderItems = pgTable('order_items', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  orderId: bigint('order_id', { mode: 'number' }).notNull().references(() => orders.id, { onDelete: 'cascade' }),
  // Kept even if the program is deleted later (then null).
  programId: bigint('program_id', { mode: 'number' }).references(() => programs.id, { onDelete: 'set null' }),
  slug: text('slug').notNull(),
  // "Beginner · Volume 1"
  label: text('label').notNull(),
  priceCents: integer('price_cents').notNull(),
  ...timestamps,
}, table => [
  check('order_items_price_valid', sql`${table.priceCents} > 0`),
  index('order_items_order_idx').on(table.orderId),
  index('order_items_program_idx').on(table.programId),
]).enableRLS();

export type User = typeof users.$inferSelect;
export type BlogPost = typeof blogPosts.$inferSelect;
export type Recipe = typeof recipes.$inferSelect;
export type Inquiry = typeof inquiries.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type NewsletterCampaign = typeof newsletterCampaigns.$inferSelect;
export type NewsletterDelivery = typeof newsletterDeliveries.$inferSelect;
export type Program = typeof programs.$inferSelect;
export type Volume = typeof volumes.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
