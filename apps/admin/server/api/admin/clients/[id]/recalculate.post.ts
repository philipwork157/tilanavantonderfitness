import {
  ClientNotFoundError,
  MissingHealthProfileError,
  recalculateNutrition,
} from '../../../../services/coaching';
import { requireAdmin } from '../../../../utils/admin-auth';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  const clientId = getRouterParam(event, 'id');
  if (!clientId || !UUID.test(clientId)) {
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
