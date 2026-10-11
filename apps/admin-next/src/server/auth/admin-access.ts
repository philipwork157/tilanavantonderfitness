import 'server-only';
/**
 * Pure access rules, kept free of Next/Supabase/database imports so they can
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
  maxAttempts: number;
  windowMs: number;
  now?: () => number;
}

const MAX_TRACKED_KEYS = 10_000;

/**
 * In-memory attempt limiter (failed sign-ins, contact form posts). It is per
 * server instance and resets on restart, which is enough at this scale.
 */
export function createAttemptLimiter({ maxAttempts, windowMs, now = Date.now }: RateLimiterOptions) {
  const attempts = new Map<string, number[]>();
  let lastSweep = now();

  /** Forgets keys whose attempts have all expired, so memory stays small. */
  const sweep = () => {
    if (now() - lastSweep < windowMs && attempts.size < MAX_TRACKED_KEYS) return;
    lastSweep = now();
    const cutoff = now() - windowMs;
    for (const [key, times] of attempts) if (!times.some((time) => time > cutoff)) attempts.delete(key);
    // Still too many (a flood of fresh keys): drop the oldest ones.
    for (const key of attempts.keys()) {
      if (attempts.size <= MAX_TRACKED_KEYS) break;
      attempts.delete(key);
    }
  };

  const recent = (key: string) => {
    const cutoff = now() - windowMs;
    const kept = (attempts.get(key) ?? []).filter(time => time > cutoff);
    if (kept.length) attempts.set(key, kept);
    else attempts.delete(key);
    return kept;
  };

  return {
    isBlocked: (key: string) => recent(key).length >= maxAttempts,
    record: (key: string) => {
      sweep();
      attempts.set(key, [...recent(key), now()]);
    },
    clear: (key: string) => {
      attempts.delete(key);
    },
    /** How many keys are remembered (for tests). */
    size: () => attempts.size,
  };
}
