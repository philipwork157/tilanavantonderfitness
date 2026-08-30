import { newsletterCampaignIdSchema, newsletterCampaignInputSchema } from '@tilana/contracts/newsletter';
import { saveNewsletterCampaign } from '../../../../services/newsletter-campaigns';
import { requireAdmin } from '../../../../utils/admin-auth';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  const id = newsletterCampaignIdSchema.safeParse(getRouterParam(event, 'id'));
  const body = newsletterCampaignInputSchema.safeParse(await readBody(event));
  if (!id.success || !body.success) throw createError({ statusCode: 400, statusMessage: 'Please check the campaign details.' });
  try {
    return { campaign: await saveNewsletterCampaign(body.data, session.user.id, id.data) };
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : 'Campaign could not be updated.' });
  }
});
