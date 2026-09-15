import { adminClientUpdateRequestSchema } from '@tilana/contracts/clients';
import { updateManualClient } from '../../../services/client-management';
import { throwClientManagementRouteError } from '../../../utils/client-route';
import { requireAdminMutation } from '../../../utils/admin-mutation';
import { readZodBody, requireRouteDatabaseId } from '../../../utils/route-validation';

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
