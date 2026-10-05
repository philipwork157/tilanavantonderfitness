/**
 * Pure admin access rules, kept free of Nuxt/Supabase imports so they can be
 * unit tested directly.
 */

export interface AuthUserLike {
  email?: string | null;
  email_confirmed_at?: string | null;
}

/** Parse NUXT_ADMIN_EMAILS (comma or whitespace separated) into a lowercase set. */
export function parseAdminEmails(raw: string | undefined | null): Set<string> {
  return new Set(
    (raw ?? '')
      .split(/[\s,]+/)
      .map(email => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Supabase proves the password; this allow-list decides who is an admin.
 * An unconfirmed email is never trusted, so a sign-up using Tilana's address
 * cannot gain access before the owner of that inbox confirms it.
 */
export function isAllowedAdmin(user: AuthUserLike | null | undefined, allowList: Set<string>): boolean {
  if (!user?.email || !user.email_confirmed_at) return false;
  return allowList.has(user.email.trim().toLowerCase());
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
 * restart, which is enough for one admin; Supabase applies its own limits too.
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
