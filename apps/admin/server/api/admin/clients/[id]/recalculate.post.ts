import {
  ClientNotFoundError,
  MissingHealthProfileError,
  recalculateNutrition,
} from '../../../../services/coaching';
import { requireAdmin } from '../../../../utils/admin-auth';
import { parseDatabaseId } from '../../../../utils/database-id';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  const clientId = parseDatabaseId(getRouterParam(event, 'id'));
  if (clientId === null) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid client identifier.' });
  }

  try {
    const target = await recalculateNutrition(clientId, session.user.id);
    if (!target) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Log a check-in first — there is no weight to calculate from.',
      });
    }
    return { ok: true, target };
  } catch (error) {
    if (error instanceof ClientNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: error.message });
    }
    if (error instanceof MissingHealthProfileError) {
      throw createError({ statusCode: 409, statusMessage: error.message });
    }
    throw error;
  }
});
