import { getAdminSession } from '../../utils/admin-auth';

export default defineEventHandler(async (event) => {
  const session = await getAdminSession(event);

  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Not authenticated.' });
  }

  return session;
});
