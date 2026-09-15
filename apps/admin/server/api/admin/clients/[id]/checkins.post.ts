import { checkinCreateSchema } from '@tilana/contracts/coaching';
import { createCheckin } from '../../../../services/coaching';
import { throwCoachingRouteError } from '../../../../utils/client-route';
import { requireAdminMutation } from '../../../../utils/admin-mutation';
import { readZodBody, requireRouteDatabaseId } from '../../../../utils/route-validation';

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
