import { getAdminDashboard } from '../../services/admin-dashboard';
import { requireAdmin } from '../../utils/admin-auth';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const config = useRuntimeConfig(event);
  const paystackEnvironment = config.paystackEnvironment === 'live' ? 'live' : 'test';

  return getAdminDashboard(paystackEnvironment);
});
