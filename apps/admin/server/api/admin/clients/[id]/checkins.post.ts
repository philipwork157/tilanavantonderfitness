import { checkinCreateSchema } from '@tilana/contracts/coaching';
import {
  CheckinDateExistsError,
  ClientNotFoundError,
  createCheckin,
} from '../../../../services/coaching';
import { requireAdmin } from '../../../../utils/admin-auth';
import { parseDatabaseId } from '../../../../utils/database-id';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  const clientId = parseDatabaseId(getRouterParam(event, 'id'));
  if (clientId === null) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid client identifier.' });
  }

  const parsed = checkinCreateSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Please check the check-in details.',
    });
  }

  try {
    const result = await createCheckin(clientId, parsed.data, session.user.id);
    setResponseStatus(event, 201);
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof ClientNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: error.message });
    }
    if (error instanceof CheckinDateExistsError) {
      throw createError({ statusCode: 409, statusMessage: error.message });
    }
    throw error;
  }
});
