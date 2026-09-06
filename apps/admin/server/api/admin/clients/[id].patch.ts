import { adminClientUpdateRequestSchema } from '@tilana/contracts/clients';
import {
  ClientEmailExistsError,
  ClientNotEditableError,
  updateManualClient,
} from '../../../services/client-management';
import { requireAdmin } from '../../../utils/admin-auth';
import { parseDatabaseId } from '../../../utils/database-id';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  const clientId = parseDatabaseId(getRouterParam(event, 'id'));
  if (clientId === null) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid client identifier.' });
  }

  const parsed = adminClientUpdateRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Please check the client details.',
    });
  }

  try {
    const client = await updateManualClient(clientId, parsed.data, session.user.id);
    if (!client) throw createError({ statusCode: 404, statusMessage: 'Client not found.' });
    return { ok: true, client };
  } catch (error) {
    if (error instanceof ClientEmailExistsError) {
      throw createError({ statusCode: 409, statusMessage: error.message });
    }
    if (error instanceof ClientNotEditableError) {
      throw createError({ statusCode: 409, statusMessage: error.message });
    }
    throw error;
  }
});
