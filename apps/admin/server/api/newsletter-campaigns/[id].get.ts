import { blogPosts } from '@tilana/db';
import { eq } from 'drizzle-orm';
import { deliveryCounts, findCampaign } from '../../services/newsletter-campaigns';
import { subscriberCounts } from '../../services/newsletter-subscribers';

/** Everything the campaign page needs, polled while sending. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const id = routeId(event);
  const db = useDatabase();
  const campaign = await findCampaign(db, id);
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found.' });

  const [post] = campaign.blogPostId
    ? await db.select({ id: blogPosts.id, title: blogPosts.title, slug: blogPosts.slug, status: blogPosts.status })
      .from(blogPosts).where(eq(blogPosts.id, campaign.blogPostId)).limit(1)
    : [];
  const [counts, subscribers] = await Promise.all([deliveryCounts(db, id), subscriberCounts(db)]);

  return {
    campaign: {
      id: campaign.id,
      blogPostId: campaign.blogPostId,
      subject: campaign.subject,
      previewText: campaign.previewText,
      introduction: campaign.introduction,
      status: campaign.status,
      testSentAt: campaign.testSentAt,
      pauseReason: campaign.pauseReason,
      recipientCount: campaign.recipientCount,
      startedAt: campaign.startedAt,
      finishedAt: campaign.finishedAt,
      updatedAt: campaign.updatedAt,
    },
    post: post ?? null,
    counts,
    subscriberCount: subscribers.subscribed,
    testRecipients: newsletterTestRecipients(),
    // Set in development: every email goes to this address instead.
    devRedirectTo: devRedirectAddress(),
  };
});
