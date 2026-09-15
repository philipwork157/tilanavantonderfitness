import { newsletterCampaignIdSchema } from '@tilana/contracts/newsletter';
import { sendNewsletterCampaignTest } from '../../../../../services/newsletter-campaigns';
import { requireAdminMutation } from '../../../../../utils/admin-mutation';

export default defineEventHandler(async (event) => {
  await requireAdminMutation(event);
  const id = newsletterCampaignIdSchema.safeParse(getRouterParam(event, 'id'));
  if (!id.success) throw createError({ statusCode: 400, statusMessage: 'Invalid campaign.' });
  try {
    const result = await sendNewsletterCampaignTest(id.data);
    return { ok: true, messageId: result.messageId };
  } catch (error) {
    throw createError({ statusCode: 500, statusMessage: error instanceof Error ? error.message : 'Test email could not be sent.' });
  }
});
