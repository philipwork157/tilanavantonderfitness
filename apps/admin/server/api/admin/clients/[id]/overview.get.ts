import { ClientNotFoundError, getClientCoachingOverview } from '../../../../services/coaching';
import { requireAdmin } from '../../../../utils/admin-auth';
import { parseDatabaseId } from '../../../../utils/database-id';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const clientId = parseDatabaseId(getRouterParam(event, 'id'));
  if (clientId === null) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid client identifier.' });
  }

  try {
    return await getClientCoachingOverview(clientId);
  } catch (error) {
    if (error instanceof ClientNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: error.message });
    }
    throw error;
  }
});
