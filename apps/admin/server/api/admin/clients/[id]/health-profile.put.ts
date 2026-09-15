import { healthProfileUpsertSchema } from '@tilana/contracts/coaching';
import { upsertHealthProfile } from '../../../../services/coaching';
import { throwCoachingRouteError } from '../../../../utils/client-route';
import { requireAdminMutation } from '../../../../utils/admin-mutation';
import { readZodBody, requireRouteDatabaseId } from '../../../../utils/route-validation';

export default defineEventHandler(async (event) => {
  const session = await requireAdminMutation(event);
  const clientId = requireRouteDatabaseId(event, 'client');
  const body = await readZodBody(event, healthProfileUpsertSchema, 'Please check the health details.');

  try {
    const profile = await upsertHealthProfile(clientId, body, session.user.id);
    return { ok: true, profile };
  } catch (error) {
    throwCoachingRouteError(error);
  }
});
