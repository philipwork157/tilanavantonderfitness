import { healthProfileUpsertSchema } from '@tilana/contracts/coaching';
import { ClientNotFoundError, upsertHealthProfile } from '../../../../services/coaching';
import { requireAdmin } from '../../../../utils/admin-auth';
import { parseDatabaseId } from '../../../../utils/database-id';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  const clientId = parseDatabaseId(getRouterParam(event, 'id'));
  if (clientId === null) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid client identifier.' });
  }

  const parsed = healthProfileUpsertSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Please check the health details.',
    });
  }

  try {
    const profile = await upsertHealthProfile(clientId, parsed.data, session.user.id);
    return { ok: true, profile };
  } catch (error) {
    if (error instanceof ClientNotFoundError) {
      throw createError({ statusCode: 404, statusMessage: error.message });
    }
    throw error;
  }
});
