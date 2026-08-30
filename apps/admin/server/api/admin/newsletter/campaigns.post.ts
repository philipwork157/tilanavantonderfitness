import { newsletterCampaignInputSchema } from '@tilana/contracts/newsletter';
import { saveNewsletterCampaign } from '../../../services/newsletter-campaigns';
import { requireAdmin } from '../../../utils/admin-auth';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  const parsed = newsletterCampaignInputSchema.safeParse(await readBody(event));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Please check the campaign details.' });
  try {
    return { campaign: await saveNewsletterCampaign(parsed.data, session.user.id) };
  } catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : 'Campaign could not be saved.' });
  }
});
