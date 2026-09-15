import {
  recalculateNutrition,
} from '../../../../services/coaching';
import { throwCoachingRouteError } from '../../../../utils/client-route';
import { requireAdminMutation } from '../../../../utils/admin-mutation';
import { requireRouteDatabaseId } from '../../../../utils/route-validation';

export default defineEventHandler(async (event) => {
  const session = await requireAdminMutation(event);
  const clientId = requireRouteDatabaseId(event, 'client');

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
    throwCoachingRouteError(error);
  }
});
