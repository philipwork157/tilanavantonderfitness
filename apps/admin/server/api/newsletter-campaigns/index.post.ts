import { createNewsletterCampaignRequestSchema } from '@tilana/contracts/admin-newsletter';
import { createCampaign } from '../../services/newsletter-campaigns';

/** New draft email for one published blog post. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const admin = await requireAdmin(event);
  const parsed = createNewsletterCampaignRequestSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Choose a blog post.' });
  const id = await campaignAction(() => createCampaign(useDatabase(), parsed.data.blogPostId, admin.id));
  return { id };
});
