import { healthProfileUpsertSchema } from '@tilana/contracts/coaching';
import { ClientNotFoundError, upsertHealthProfile } from '../../../../services/coaching';
import { requireAdmin } from '../../../../utils/admin-auth';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  const clientId = getRouterParam(event, 'id');
  if (!clientId || !UUID.test(clientId)) {
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
