import { newsletterCampaignInputSchema } from '@tilana/contracts/newsletter';
import { saveNewsletterCampaign } from '@server/services/newsletter-campaigns';
import { requireAdminMutation } from '@server/utils/admin-mutation';
import { readZodBody, requireRouteDatabaseId } from '@server/utils/route-validation';

export default defineEventHandler(async (event) => {
  const session = await requireAdminMutation(event);
  const campaignId = requireRouteDatabaseId(event, 'campaign');
  const body = await readZodBody(event, newsletterCampaignInputSchema, 'Please check the campaign details.');
  try {
    return { campaign: await saveNewsletterCampaign(body, session.user.id, campaignId) };
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : 'Campaign could not be updated.' });
  }
});
