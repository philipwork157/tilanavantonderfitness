import { listClientsWithProgrammes } from '../../services/client-management';
import { requireAdmin } from '../../utils/admin-auth';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  return { clients: await listClientsWithProgrammes() };
});
