import { getAdminDashboard } from '../../services/admin-dashboard';
import { requireAdmin } from '../../utils/admin-auth';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  return getAdminDashboard();
});
