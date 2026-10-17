import { newsletterCampaignInputSchema } from '@tilana/contracts/admin-newsletter';
import { blogPosts } from '@tilana/db';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { deleteDraftCampaign, deliveryCounts, findCampaign, updateCampaign } from '@/server/services/newsletter-campaigns';
import { subscriberCounts } from '@/server/services/newsletter-subscribers';
import { devRedirectAddress, newsletterTestRecipients } from '@/server/utils/newsletter';
import { campaignAction, firstIssue } from '@/server/utils/newsletter-errors';

/** Everything the campaign page needs, polled while sending. */
export const GET = handle(async (_request: Request, context: IdContext) => {
  await requireAdmin();
  const id = await routeId(context);
  const db = getDatabase();
  const campaign = await findCampaign(db, id);
  if (!campaign) throw new HttpError(404, 'Campaign not found.');

  const [post] = campaign.blogPostId
    ? await db.select({ id: blogPosts.id, title: blogPosts.title, slug: blogPosts.slug, status: blogPosts.status })
      .from(blogPosts).where(eq(blogPosts.id, campaign.blogPostId)).limit(1)
    : [];
  const [counts, subscribers] = await Promise.all([deliveryCounts(db, id), subscriberCounts(db)]);

  return Response.json({
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
  });
});

/** Save a draft. Clears the test, so a new test is needed before sending. */
export const PUT = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  const id = await routeId(context);
  const parsed = newsletterCampaignInputSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, firstIssue(parsed.error.issues, 'Please check the email.'));
  const campaign = await campaignAction(() => updateCampaign(getDatabase(), id, parsed.data));
  return Response.json({ testSentAt: campaign.testSentAt, updatedAt: campaign.updatedAt });
});

export const DELETE = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  if (!(await deleteDraftCampaign(getDatabase(), await routeId(context)))) {
    throw new HttpError(409, 'Only drafts can be deleted.');
  }
  return Response.json({ ok: true });
});
