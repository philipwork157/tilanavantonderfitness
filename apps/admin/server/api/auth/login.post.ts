import { adminLoginRequestSchema } from '@tilana/contracts/auth';
import { clearLoginRateLimit, enforceLoginRateLimit, enforceSameOrigin } from '../../utils/auth-security';
import { findAdminUser } from '../../utils/admin-auth';
import { readZodBody } from '../../utils/route-validation';
import { createSupabaseAuthClient } from '../../utils/supabase-auth';

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
      role: 'admin' as const,
    },
  };
});
