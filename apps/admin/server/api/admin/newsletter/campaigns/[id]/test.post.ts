import { sendNewsletterCampaignTest } from '../../../../../services/newsletter-campaigns';
import { requireAdminMutation } from '../../../../../utils/admin-mutation';
import { requireRouteDatabaseId } from '../../../../../utils/route-validation';

export default defineEventHandler(async (event) => {
  await requireAdminMutation(event);
  const campaignId = requireRouteDatabaseId(event, 'campaign');
  try {
    const result = await sendNewsletterCampaignTest(campaignId);
    return { ok: true, messageId: result.messageId };
  } catch (error) {
    throw createError({ statusCode: 500, statusMessage: error instanceof Error ? error.message : 'Test email could not be sent.' });
  }
});
