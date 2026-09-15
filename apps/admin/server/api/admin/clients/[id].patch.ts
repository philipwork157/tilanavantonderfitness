import { adminClientUpdateRequestSchema } from '@tilana/contracts/clients';
import { updateManualClient } from '@server/services/client-management';
import { throwClientManagementRouteError } from '@server/utils/client-route';
import { requireAdminMutation } from '@server/utils/admin-mutation';
import { readZodBody, requireRouteDatabaseId } from '@server/utils/route-validation';

export default defineEventHandler(async (event) => {
  const session = await requireAdminMutation(event);
  const clientId = requireRouteDatabaseId(event, 'client');
  const body = await readZodBody(event, adminClientUpdateRequestSchema, 'Please check the client details.');

  try {
    const client = await updateManualClient(clientId, body, session.user.id);
    if (!client) throw createError({ statusCode: 404, statusMessage: 'Client not found.' });
    return { ok: true, client };
  } catch (error) {
    throwClientManagementRouteError(error);
  }
});
