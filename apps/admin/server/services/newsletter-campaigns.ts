import { and, desc, eq, sql } from 'drizzle-orm';
import { blogPosts, newsletterCampaigns, newsletterDeliveries, type Database } from '@tilana/db';
import type { NewsletterCampaignInput } from '@tilana/contracts/admin-newsletter';

/** A problem Tilana can fix (shown as a 400/409 message in the admin). */
export class CampaignError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
  }
}

async function requirePublishedPost(db: Database, blogPostId: number) {
  const [post] = await db.select().from(blogPosts).where(eq(blogPosts.id, blogPostId)).limit(1);
  if (!post) throw new CampaignError('That blog post no longer exists.');
  if (post.status !== 'published') throw new CampaignError('Publish the blog post first, so the link in the email works.');
  return post;
}

/** New draft for a published post, with its title and summary as a starting point. */
export async function createCampaign(db: Database, blogPostId: number, userId: number): Promise<number> {
  const post = await requirePublishedPost(db, blogPostId);
  const [campaign] = await db.insert(newsletterCampaigns).values({
    blogPostId,
    subject: post.title.slice(0, 150),
    previewText: post.excerpt.slice(0, 200),
    createdBy: userId,
  }).returning({ id: newsletterCampaigns.id });
  return campaign!.id;
}

export async function findCampaign(db: Database, id: number) {
  const [campaign] = await db.select().from(newsletterCampaigns).where(eq(newsletterCampaigns.id, id)).limit(1);
  return campaign;
}

/** Saves a draft. Any change means the test email has to be sent again. */
export async function updateCampaign(db: Database, id: number, input: NewsletterCampaignInput) {
  await requirePublishedPost(db, input.blogPostId);
  const [updated] = await db.update(newsletterCampaigns).set({
    blogPostId: input.blogPostId,
    subject: input.subject,
    previewText: input.previewText,
    introduction: input.introduction,
    testSentAt: null,
  }).where(and(eq(newsletterCampaigns.id, id), eq(newsletterCampaigns.status, 'draft'))).returning();
  if (!updated) throw new CampaignError('Only drafts can be changed.', 409);
  return updated;
}

export async function deleteDraftCampaign(db: Database, id: number): Promise<boolean> {
  const deleted = await db.delete(newsletterCampaigns)
    .where(and(eq(newsletterCampaigns.id, id), eq(newsletterCampaigns.status, 'draft')))
    .returning({ id: newsletterCampaigns.id });
  return deleted.length > 0;
}

export async function markTestSent(db: Database, id: number, at = new Date()) {
  await db.update(newsletterCampaigns).set({ testSentAt: at })
    .where(and(eq(newsletterCampaigns.id, id), eq(newsletterCampaigns.status, 'draft')));
}

export type DeliveryCounts = Record<'queued' | 'sent' | 'skipped' | 'failed' | 'bounced' | 'complained', number>;

export async function deliveryCounts(db: Database, campaignId: number): Promise<DeliveryCounts> {
  const rows = await db.select({ status: newsletterDeliveries.status, count: sql<number>`count(*)::int` })
    .from(newsletterDeliveries).where(eq(newsletterDeliveries.campaignId, campaignId))
    .groupBy(newsletterDeliveries.status);
  const get = (status: string) => rows.find(row => row.status === status)?.count ?? 0;
  return {
    // "sending" rows are in flight; they count as still to go.
    queued: get('queued') + get('sending'),
    sent: get('sent'),
    skipped: get('skipped'),
    failed: get('failed'),
    bounced: get('bounced'),
    complained: get('complained'),
  };
}

export async function listCampaigns(db: Database) {
  const sentCount = sql<number>`(select count(*)::int from ${newsletterDeliveries} d where d.campaign_id = ${newsletterCampaigns.id} and d.status in ('sent', 'bounced', 'complained'))`;
  return db.select({
    id: newsletterCampaigns.id,
    subject: newsletterCampaigns.subject,
    status: newsletterCampaigns.status,
    recipientCount: newsletterCampaigns.recipientCount,
    sentCount,
    startedAt: newsletterCampaigns.startedAt,
    finishedAt: newsletterCampaigns.finishedAt,
    updatedAt: newsletterCampaigns.updatedAt,
    postTitle: blogPosts.title,
  }).from(newsletterCampaigns)
    .leftJoin(blogPosts, eq(blogPosts.id, newsletterCampaigns.blogPostId))
    .orderBy(desc(newsletterCampaigns.createdAt))
    .limit(200);
}

export async function listDeliveries(db: Database, campaignId: number) {
  return db.select({
    id: newsletterDeliveries.id,
    email: newsletterDeliveries.email,
    status: newsletterDeliveries.status,
    error: newsletterDeliveries.error,
    sentAt: newsletterDeliveries.sentAt,
  }).from(newsletterDeliveries)
    .where(eq(newsletterDeliveries.campaignId, campaignId))
    .orderBy(newsletterDeliveries.id);
}
