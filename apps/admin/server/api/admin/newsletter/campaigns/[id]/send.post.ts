import { sendNewsletterCampaign } from '../../../../../services/newsletter-campaigns';
import { requireAdminMutation } from '../../../../../utils/admin-mutation';
import { requireRouteDatabaseId } from '../../../../../utils/route-validation';

export default defineEventHandler(async (event) => {
  await requireAdminMutation(event);
  const campaignId = requireRouteDatabaseId(event, 'campaign');
  try {
    return { ok: true, ...(await sendNewsletterCampaign(campaignId)) };
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : 'Campaign could not be sent.' });
  }
});
