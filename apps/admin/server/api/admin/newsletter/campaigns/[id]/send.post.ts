import { newsletterCampaignIdSchema } from '@tilana/contracts/newsletter';
import { sendNewsletterCampaign } from '../../../../../services/newsletter-campaigns';
import { requireAdminMutation } from '../../../../../utils/admin-mutation';

export default defineEventHandler(async (event) => {
  await requireAdminMutation(event);
  const id = newsletterCampaignIdSchema.safeParse(getRouterParam(event, 'id'));
  if (!id.success) throw createError({ statusCode: 400, statusMessage: 'Invalid campaign.' });
  try {
    return { ok: true, ...(await sendNewsletterCampaign(id.data)) };
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : 'Campaign could not be sent.' });
  }
});
