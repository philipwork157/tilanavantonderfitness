import { createNewsletterCampaignRequestSchema } from '@tilana/contracts/admin-newsletter';
import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, sameOriginOnly } from '@/server/http';
import { createCampaign, listCampaigns } from '@/server/services/newsletter-campaigns';
import { subscriberCounts } from '@/server/services/newsletter-subscribers';
import { campaignAction } from '@/server/utils/newsletter-errors';

export const GET = handle(async () => {
  await requireAdmin();
  const db = getDatabase();
  const [campaigns, counts] = await Promise.all([listCampaigns(db), subscriberCounts(db)]);
  return Response.json({ campaigns, subscriberCount: counts.subscribed });
});

/** New draft email for one published blog post. */
export const POST = handle(async (request: Request) => {
  sameOriginOnly(request, isSameOrigin);
  const admin = await requireAdmin();
  const parsed = createNewsletterCampaignRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'Choose a blog post.');
  const id = await campaignAction(() => createCampaign(getDatabase(), parsed.data.blogPostId, admin.id));
  return Response.json({ id });
});
