import { listNewsletterCampaigns } from '@server/services/newsletter-campaigns';
import { requireAdmin } from '@server/utils/admin-auth';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  return { campaigns: await listNewsletterCampaigns() };
});
