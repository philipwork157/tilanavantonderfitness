import { adminClientCreateRequestSchema } from '@tilana/contracts/clients';
import { createManualClient } from '@server/services/client-management';
import { throwClientManagementRouteError } from '@server/utils/client-route';
import { requireAdminMutation } from '@server/utils/admin-mutation';
import { readZodBody } from '@server/utils/route-validation';

export default defineEventHandler(async (event) => {
  const session = await requireAdminMutation(event);
  const body = await readZodBody(event, adminClientCreateRequestSchema, 'Please check the client details.');

  try {
    const client = await createManualClient(body, session.user.id);
    setResponseStatus(event, 201);
    return { ok: true, client };
  } catch (error) {
    throwClientManagementRouteError(error);
  }
});
