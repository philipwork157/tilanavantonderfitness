import type { NewsletterCampaignInput } from '@tilana/contracts/newsletter';
import { newsletterCampaignDeliveries, newsletterCampaigns, newsletterCampaignTestDeliveries, newsletterSubscribers } from '@tilana/db/schema';
import { and, count, desc, eq, max, ne } from 'drizzle-orm';
import { getDatabase } from '../utils/database';
import { isNewsletterDevelopmentEnvironment, sendNewsletterCampaignEmail } from './newsletter-emails';
import { createNewsletterUnsubscribeToken } from './newsletter-subscriptions';

function validateBlogUrl(value: string) {
  const url = new URL(value);
  const productionUrl = url.origin === 'https://tilanavantonder.co.za' && url.pathname.startsWith('/blog/');
  const developmentUrl = isNewsletterDevelopmentEnvironment()
    && ['localhost', '127.0.0.1', 'website-dev.tilanavantonder.co.za'].includes(url.hostname)
    && url.pathname.startsWith('/blog/');
  if (!productionUrl && !developmentUrl) throw new Error('Use a published Tilana blog link.');
}

export async function listNewsletterCampaigns() {
  const database = getDatabase();
  const campaigns = await database.select().from(newsletterCampaigns)
    .orderBy(desc(newsletterCampaigns.createdAt)).limit(50);
  let testSummaries: Array<{ campaignId: number; testSentCount: number; lastTestSentAt: Date | null }> = [];
  try {
    testSummaries = await database.select({
      campaignId: newsletterCampaignTestDeliveries.campaignId,
      testSentCount: count(),
      lastTestSentAt: max(newsletterCampaignTestDeliveries.sentAt),
    }).from(newsletterCampaignTestDeliveries)
      .where(eq(newsletterCampaignTestDeliveries.status, 'sent'))
      .groupBy(newsletterCampaignTestDeliveries.campaignId);
  } catch (error) {
    console.warn('Newsletter test-delivery history is unavailable until its migration is applied.', error);
  }
  const testsByCampaign = new Map(testSummaries.map((item) => [item.campaignId, item]));
  return campaigns.map((campaign) => ({
    ...campaign,
    testSentCount: testsByCampaign.get(campaign.id)?.testSentCount ?? 0,
    lastTestSentAt: testsByCampaign.get(campaign.id)?.lastTestSentAt ?? null,
  }));
}

export async function saveNewsletterCampaign(input: NewsletterCampaignInput, createdByUserId: number, id?: number) {
  validateBlogUrl(input.blogUrl);
  const database = getDatabase();
  const values = {
    subject: input.subject,
    previewText: input.previewText || null,
    blogTitle: input.blogTitle,
    introduction: input.introduction,
    blogUrl: input.blogUrl,
    updatedAt: new Date(),
  };
  if (id) {
    const [campaign] = await database.update(newsletterCampaigns).set(values)
      .where(and(eq(newsletterCampaigns.id, id), eq(newsletterCampaigns.status, 'draft'))).returning();
    if (!campaign) throw new Error('Only draft campaigns can be edited.');
    return campaign;
  }
  const [campaign] = await database.insert(newsletterCampaigns).values({ ...values, createdByUserId }).returning();
  if (!campaign) throw new Error('Campaign could not be created.');
  return campaign;
}

async function getCampaign(id: number) {
  const [campaign] = await getDatabase().select().from(newsletterCampaigns)
    .where(eq(newsletterCampaigns.id, id)).limit(1);
  if (!campaign) throw new Error('Campaign was not found.');
  return campaign;
}

function campaignInput(campaign: Awaited<ReturnType<typeof getCampaign>>): NewsletterCampaignInput {
  return {
    subject: campaign.subject,
    previewText: campaign.previewText ?? '',
    blogTitle: campaign.blogTitle,
    introduction: campaign.introduction,
    blogUrl: campaign.blogUrl,
  };
}

export async function sendNewsletterCampaignTest(id: number) {
  const campaign = await getCampaign(id);
  const config = useRuntimeConfig();
  const recipient = String(config.newsletterDevelopmentRecipient || '').trim();
  const siteUrl = String(config.newsletterSiteUrl || 'https://tilanavantonder.co.za').replace(/\/$/, '');
  if (!recipient) throw new Error('A newsletter test recipient has not been configured.');
  const database = getDatabase();
  let result: Awaited<ReturnType<typeof sendNewsletterCampaignEmail>>;
  try {
    result = await sendNewsletterCampaignEmail({
      campaign: campaignInput(campaign),
      recipient,
      unsubscribeUrl: `${siteUrl}/privacy`,
      test: true,
    });
  } catch (error) {
    await database.insert(newsletterCampaignTestDeliveries).values({
      campaignId: id,
      recipientSnapshot: recipient,
      status: 'failed',
      lastError: (error instanceof Error ? error.message : 'Test delivery failed.').slice(0, 1_000),
    });
    throw error;
  }
  await database.insert(newsletterCampaignTestDeliveries).values({
    campaignId: id,
    recipientSnapshot: recipient,
    status: 'sent',
    sesMessageId: result.messageId,
    sentAt: new Date(),
  });
  return result;
}

export async function sendNewsletterCampaign(id: number) {
  const campaign = await getCampaign(id);
  const config = useRuntimeConfig();
  const siteUrl = String(config.newsletterSiteUrl || 'https://tilanavantonder.co.za').replace(/\/$/, '');
  const developmentRecipient = String(config.newsletterDevelopmentRecipient || '').trim();

  if (isNewsletterDevelopmentEnvironment()) {
    if (!developmentRecipient) throw new Error('A safe development newsletter recipient is required.');
    const result = await sendNewsletterCampaignTest(id);
    return { mode: 'preview' as const, sentCount: 1, failedCount: 0, messageId: result.messageId };
  }

  if (campaign.status === 'sent') throw new Error('This campaign has already been sent.');
  const database = getDatabase();
  const subscribers = await database.select({ id: newsletterSubscribers.id, email: newsletterSubscribers.email })
    .from(newsletterSubscribers).where(eq(newsletterSubscribers.status, 'subscribed'));
  if (!subscribers.length) throw new Error('There are no confirmed subscribers to email.');

  const [claimed] = await database.update(newsletterCampaigns).set({
    status: 'sending',
    recipientCount: subscribers.length,
    startedAt: campaign.startedAt ?? new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(newsletterCampaigns.id, id),
    ne(newsletterCampaigns.status, 'sent'),
    ne(newsletterCampaigns.status, 'sending'),
  )).returning({ id: newsletterCampaigns.id });
  if (!claimed) throw new Error('This campaign is already being sent.');

  await database.insert(newsletterCampaignDeliveries).values(subscribers.map((subscriber) => ({
    campaignId: id,
    subscriberId: subscriber.id,
    emailSnapshot: subscriber.email,
  }))).onConflictDoNothing();
  const deliveries = await database.select({
    id: newsletterCampaignDeliveries.id,
    subscriberId: newsletterCampaignDeliveries.subscriberId,
    email: newsletterCampaignDeliveries.emailSnapshot,
    subscriberStatus: newsletterSubscribers.status,
    attemptCount: newsletterCampaignDeliveries.attemptCount,
  }).from(newsletterCampaignDeliveries)
    .innerJoin(newsletterSubscribers, eq(newsletterSubscribers.id, newsletterCampaignDeliveries.subscriberId))
    .where(and(eq(newsletterCampaignDeliveries.campaignId, id), ne(newsletterCampaignDeliveries.status, 'sent')));

  for (const delivery of deliveries) {
    const now = new Date();
    if (delivery.subscriberStatus !== 'subscribed') {
      await database.update(newsletterCampaignDeliveries).set({ status: 'skipped', updatedAt: now })
        .where(eq(newsletterCampaignDeliveries.id, delivery.id));
      continue;
    }
    try {
      const token = await createNewsletterUnsubscribeToken(delivery.subscriberId);
      const result = await sendNewsletterCampaignEmail({
        campaign: campaignInput(campaign),
        recipient: delivery.email,
        unsubscribeUrl: `${siteUrl}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`,
      });
      await database.update(newsletterCampaignDeliveries).set({
        status: 'sent', sesMessageId: result.messageId, attemptCount: delivery.attemptCount + 1,
        lastError: null, sentAt: now, updatedAt: now,
      }).where(eq(newsletterCampaignDeliveries.id, delivery.id));
    } catch (error) {
      await database.update(newsletterCampaignDeliveries).set({
        status: 'failed', attemptCount: delivery.attemptCount + 1,
        lastError: (error instanceof Error ? error.message : 'Email delivery failed.').slice(0, 1_000),
        updatedAt: now,
      }).where(eq(newsletterCampaignDeliveries.id, delivery.id));
    }
  }

  const finalDeliveries = await database.select({ status: newsletterCampaignDeliveries.status })
    .from(newsletterCampaignDeliveries).where(eq(newsletterCampaignDeliveries.campaignId, id));
  const sentCount = finalDeliveries.filter((item) => item.status === 'sent').length;
  const failedCount = finalDeliveries.filter((item) => item.status === 'failed').length;
  const status = sentCount === subscribers.length ? 'sent' : sentCount ? 'partially_failed' : 'failed';
  await database.update(newsletterCampaigns).set({
    status, recipientCount: subscribers.length, sentCount, failedCount,
    sentAt: status === 'sent' ? new Date() : null, updatedAt: new Date(),
  }).where(eq(newsletterCampaigns.id, id));
  return { mode: 'live' as const, sentCount, failedCount };
}
