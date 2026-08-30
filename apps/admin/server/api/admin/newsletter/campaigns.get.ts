import { listNewsletterCampaigns } from '../../../services/newsletter-campaigns';
import { requireAdmin } from '../../../utils/admin-auth';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  return { campaigns: await listNewsletterCampaigns() };
});
