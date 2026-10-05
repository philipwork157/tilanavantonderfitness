/**
 * Pure access rules, kept free of Nuxt/Supabase/database imports so they can
 * be unit tested directly.
 */

export interface AuthUserLike {
  email?: string | null;
  email_confirmed_at?: string | null;
}

/** Only a confirmed email may be linked to a users row (prevents claiming someone else's email). */
export function confirmedEmail(user: AuthUserLike | null | undefined): string | null {
  if (!user?.email || !user.email_confirmed_at) return null;
  return user.email.trim().toLowerCase();
}

/** State-changing requests must come from this site (basic CSRF protection). */
export function isSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  }
  catch {
    return false;
  }
}

interface RateLimiterOptions {
  maxFailures: number;
  windowMs: number;
  now?: () => number;
}

/**
 * In-memory failed-login limiter. It is per server instance and resets on
 * restart, which is enough for a handful of admins; Supabase applies its own limits too.
 */
export function createFailureLimiter({ maxFailures, windowMs, now = Date.now }: RateLimiterOptions) {
  const failures = new Map<string, number[]>();

  const recent = (key: string) => {
    const cutoff = now() - windowMs;
    const kept = (failures.get(key) ?? []).filter(time => time > cutoff);
    if (kept.length) failures.set(key, kept);
    else failures.delete(key);
    return kept;
  };

  return {
    isBlocked: (key: string) => recent(key).length >= maxFailures,
    recordFailure: (key: string) => {
      failures.set(key, [...recent(key), now()]);
    },
    clear: (key: string) => {
      failures.delete(key);
    },
  };
}
