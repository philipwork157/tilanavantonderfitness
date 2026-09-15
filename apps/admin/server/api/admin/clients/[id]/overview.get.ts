import { ClientNotFoundError, getClientCoachingOverview } from '../../../../services/coaching';
import { requireAdmin } from '../../../../utils/admin-auth';
import { requireRouteDatabaseId } from '../../../../utils/route-validation';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const clientId = requireRouteDatabaseId(event, 'client');

  try {
    return await getClientCoachingOverview(clientId);
  } catch (error) {
    if (error instanceof ClientNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: error.message });
    }
    throw error;
  }
});
