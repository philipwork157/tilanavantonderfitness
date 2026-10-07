import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { adminLoginRequestSchema } from '@tilana/contracts/admin-auth';
import { NextResponse } from 'next/server';
import { createAttemptLimiter, isSameOrigin } from '@/server/auth/admin-access';
import { resolveAdminUser } from '@/server/auth/admin-users';
import { getDatabase } from '@/server/db';
import { clientIp, handle, HttpError, sameOriginOnly } from '@/server/http';
import { clearSupabaseCookies, createSupabaseServerClient } from '@/server/auth/supabase';

const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const failedLogins = createAttemptLimiter({ maxAttempts: 5, windowMs: FAILURE_WINDOW_MS });

export const POST = handle(async (request: Request) => {
  sameOriginOnly(request, isSameOrigin);
  const db = getDatabase();

  const parsed = adminLoginRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, 'Enter your email address and password.');
  const { email, password } = parsed.data;

  const limitKey = `${clientIp(request)}:${email}`;
  if (failedLogins.isBlocked(limitKey)) {
    throw new HttpError(429, 'Too many sign-in attempts. Please wait 15 minutes and try again.');
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error && (isAuthRetryableFetchError(error) || (error.status ?? 500) >= 500)) {
    throw new HttpError(503, 'Sign-in is temporarily unavailable. Please try again shortly.');
  }
  if (error || !data.user) {
    failedLogins.record(limitKey);
    throw new HttpError(401, 'The email address or password is incorrect.');
  }

  // A valid Supabase account is not enough: it needs an active users row with an admin-area role.
  let admin;
  try {
    admin = await resolveAdminUser(db, data.user, { recordSignIn: true });
  } catch (lookupError) {
    // Never leave a Supabase session behind if the access check itself failed.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    await clearSupabaseCookies();
    console.error('Admin access lookup failed', lookupError);
    throw new HttpError(503, 'Sign-in is temporarily unavailable. Please try again shortly.');
  }
  if (!admin) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    await clearSupabaseCookies();
    failedLogins.record(limitKey);
    throw new HttpError(403, 'This account does not have admin access.');
  }

  failedLogins.clear(limitKey);
  return NextResponse.json({ user: admin });
});
