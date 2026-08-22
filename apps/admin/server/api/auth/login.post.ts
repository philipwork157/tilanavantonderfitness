import { adminLoginRequestSchema } from '@tilana/contracts/auth';
import { clearLoginRateLimit, enforceLoginRateLimit, enforceSameOrigin } from '../../utils/auth-security';
import { findAdminProfile } from '../../utils/admin-auth';
import { createSupabaseAuthClient } from '../../utils/supabase-auth';

export default defineEventHandler(async (event) => {
  enforceSameOrigin(event);
  enforceLoginRateLimit(event);

  const parsed = adminLoginRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Enter a valid email address and password.' });
  }

  const supabase = createSupabaseAuthClient(event);
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    throw createError({ statusCode: 401, statusMessage: 'The email address or password is incorrect.' });
  }

  const admin = await findAdminProfile(data.user.id);
  if (!admin) {
    await supabase.auth.signOut();
    throw createError({ statusCode: 403, statusMessage: 'This account does not have administrator access.' });
  }

  clearLoginRateLimit(event);
  return {
    authenticated: true as const,
    user: {
      id: admin.userId,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: 'admin' as const,
    },
  };
});
