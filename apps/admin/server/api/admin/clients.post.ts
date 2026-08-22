import { adminClientCreateRequestSchema } from '@tilana/contracts/clients';
import {
  ClientEmailExistsError,
  createManualClient,
} from '../../services/client-management';
import { requireAdmin } from '../../utils/admin-auth';

export default defineEventHandler(async (event) => {
  const session = await requireAdmin(event);
  const parsed = adminClientCreateRequestSchema.safeParse(await readBody(event));

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message ?? 'Please check the client details.',
    });
  }

  try {
    const client = await createManualClient(parsed.data, session.user.id);
    setResponseStatus(event, 201);
    return { ok: true, client };
  } catch (error) {
    if (error instanceof ClientEmailExistsError) {
      throw createError({ statusCode: 409, statusMessage: error.message });
    }
    throw error;
  }
});
