import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { adminLoginRequestSchema } from '@tilana/contracts/admin-auth';
import { createFailureLimiter, isAllowedAdmin } from '../../utils/admin-access';

const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failedLogins = createFailureLimiter({ maxFailures: 5, windowMs: FAILURE_WINDOW_MS });

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const allowList = getAdminAllowList(event);

  const parsed = adminLoginRequestSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Enter your email address and password.' });
  }
  const { email, password } = parsed.data;

  const limitKey = `${getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'}:${email}`;
  if (failedLogins.isBlocked(limitKey)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many sign-in attempts. Please wait 15 minutes and try again.' });
  }

  const supabase = useSupabaseServerClient(event);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error && (isAuthRetryableFetchError(error) || (error.status ?? 500) >= 500)) {
    throw createError({ statusCode: 503, statusMessage: 'Sign-in is temporarily unavailable. Please try again shortly.' });
  }
  if (error || !data.user) {
    failedLogins.recordFailure(limitKey);
    throw createError({ statusCode: 401, statusMessage: 'The email address or password is incorrect.' });
  }

  // A valid Supabase account is not enough: it must also be on the admin allow-list.
  if (!isAllowedAdmin(data.user, allowList)) {
    await supabase.auth.signOut({ scope: 'local' });
    failedLogins.recordFailure(limitKey);
    throw createError({ statusCode: 403, statusMessage: 'This account does not have admin access.' });
  }

  failedLogins.clear(limitKey);
  return { user: toAdminUser(data.user) };
});
