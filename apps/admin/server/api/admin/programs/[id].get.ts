import { getAdminProgram } from '../../../services/program-catalogue';
import { requireAdmin } from '../../../utils/admin-auth';
import { parseDatabaseId } from '../../../utils/database-id';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const programId = parseDatabaseId(getRouterParam(event, 'id'));
  if (programId === null) throw createError({ statusCode: 400, statusMessage: 'Invalid program identifier.' });
  const program = await getAdminProgram(programId);
  if (!program) throw createError({ statusCode: 404, statusMessage: 'Program not found.' });
  return { program };
});
