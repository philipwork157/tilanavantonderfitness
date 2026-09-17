import { adminLoginRequestSchema } from '@tilana/contracts/auth';
import { USER_ROLES } from '@tilana/contracts/identity';
import { clearLoginRateLimit, enforceLoginRateLimit, enforceSameOrigin } from '@server/utils/auth-security';
import { findAdminUser } from '@server/utils/admin-auth';
import { readZodBody } from '@server/utils/route-validation';
import { createSupabaseAuthClient } from '@server/utils/supabase-auth';

export default defineEventHandler(async (event) => {
  enforceSameOrigin(event);
  enforceLoginRateLimit(event);

  const body = await readZodBody(
    event,
    adminLoginRequestSchema,
    'Enter a valid email address and password.',
    { exposeIssueMessage: false },
  );

  const supabase = createSupabaseAuthClient(event);
  const { data, error } = await supabase.auth.signInWithPassword(body);

  if (error || !data.user) {
    throw createError({ statusCode: 401, statusMessage: 'The email address or password is incorrect.' });
  }

  const admin = await findAdminUser(data.user.id);
  if (!admin) {
    await supabase.auth.signOut();
    throw createError({ statusCode: 403, statusMessage: 'This account does not have administrator access.' });
  }

  clearLoginRateLimit(event);
  return {
    authenticated: true as const,
    user: {
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: USER_ROLES.ADMIN,
    },
  };
});
