import { getAdminProgram } from '../../../services/program-catalogue';
import { requireAdmin } from '../../../utils/admin-auth';
import { requireRouteDatabaseId } from '../../../utils/route-validation';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const programId = requireRouteDatabaseId(event, 'program');
  const program = await getAdminProgram(programId);
  if (!program) throw createError({ statusCode: 404, statusMessage: 'Program not found.' });
  return { program };
});
