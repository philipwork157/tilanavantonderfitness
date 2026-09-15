import { newsletterCampaignInputSchema } from '@tilana/contracts/newsletter';
import { saveNewsletterCampaign } from '../../../services/newsletter-campaigns';
import { requireAdminMutation } from '../../../utils/admin-mutation';
import { readZodBody } from '../../../utils/route-validation';

export default defineEventHandler(async (event) => {
  const session = await requireAdminMutation(event);
  const body = await readZodBody(event, newsletterCampaignInputSchema, 'Please check the campaign details.');
  try {
    return { campaign: await saveNewsletterCampaign(body, session.user.id) };
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : 'Campaign could not be saved.' });
  }
});
