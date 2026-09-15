import { listNewsletterSubscribers } from '@server/services/admin-dashboard';
import { requireAdmin } from '@server/utils/admin-auth';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  return { subscribers: await listNewsletterSubscribers() };
});
