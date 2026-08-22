import type { H3Event } from 'h3';
import { getHeader, getRequestHost, getRequestIP } from 'h3';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 6;
const attempts = new Map<string, { count: number; resetAt: number }>();

export function enforceSameOrigin(event: H3Event) {
  const origin = getHeader(event, 'origin');
  const host = getRequestHost(event, { xForwardedHost: true });

  if (!origin) {
    throw createError({ statusCode: 403, statusMessage: 'Request origin is required.' });
  }

  try {
    if (new URL(origin).host !== host) throw new Error('Origin mismatch');
  } catch {
    throw createError({ statusCode: 403, statusMessage: 'Request origin is not allowed.' });
  }
}

export function enforceLoginRateLimit(event: H3Event) {
  const key = getRequestIP(event, { xForwardedFor: true }) || 'unknown';
  const now = Date.now();
  const current = attempts.get(key);

  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  current.count += 1;
  if (current.count > MAX_ATTEMPTS) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many sign-in attempts. Please wait and try again.',
    });
  }
}

export function clearLoginRateLimit(event: H3Event) {
  const key = getRequestIP(event, { xForwardedFor: true }) || 'unknown';
  attempts.delete(key);
}
