import { listAdminPrograms } from '@server/services/program-catalogue';
import { requireAdmin } from '@server/utils/admin-auth';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  return { programs: await listAdminPrograms() };
});
