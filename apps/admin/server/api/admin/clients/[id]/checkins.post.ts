import { checkinCreateSchema } from '@tilana/contracts/coaching';
import { createCheckin } from '@server/services/coaching';
import { throwCoachingRouteError } from '@server/utils/client-route';
import { requireAdminMutation } from '@server/utils/admin-mutation';
import { readZodBody, requireRouteDatabaseId } from '@server/utils/route-validation';

export default defineEventHandler(async (event) => {
  const session = await requireAdminMutation(event);
  const clientId = requireRouteDatabaseId(event, 'client');
  const body = await readZodBody(event, checkinCreateSchema, 'Please check the check-in details.');

  try {
    const result = await createCheckin(clientId, body, session.user.id);
    setResponseStatus(event, 201);
    return { ok: true, ...result };
  } catch (error) {
    throwCoachingRouteError(error);
  }
});
