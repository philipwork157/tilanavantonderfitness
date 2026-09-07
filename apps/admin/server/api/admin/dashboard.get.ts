import { adminDashboardQuerySchema } from '@tilana/contracts/dashboard';
import { getAdminDashboard } from '../../services/admin-dashboard';
import { requireAdmin } from '../../utils/admin-auth';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const query = adminDashboardQuerySchema.safeParse(getQuery(event));

  if (!query.success) {
    throw createError({ statusCode: 400, statusMessage: 'Select a valid dashboard period.' });
  }

  const config = useRuntimeConfig(event);
  const paystackEnvironment = config.paystackEnvironment === 'live' ? 'live' : 'test';

  return getAdminDashboard(paystackEnvironment, query.data.periodDays);
});
