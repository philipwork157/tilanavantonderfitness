interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface TurnstileResult {
  success: boolean;
  action?: string;
  'error-codes'?: string[];
}

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const MAX_RATE_LIMIT_ENTRIES = 5_000;
const rateLimits = new Map<string, RateLimitEntry>();
const isProduction = process.env.NODE_ENV === 'production';

function getAllowedOrigins(): Set<string> {
  const { contactAllowedOrigins } = useRuntimeConfig();
  return new Set(
    String(contactAllowedOrigins)
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );
}

export function applyContactCors(event: Parameters<typeof getHeader>[0]): string {
  const origin = getHeader(event, 'origin')?.replace(/\/$/, '');

  if (!origin || !getAllowedOrigins().has(origin)) {
    throw createError({ statusCode: 403, statusMessage: 'Origin not allowed.' });
  }

  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  });

  return origin;
}

export function getContactRequestIp(event: Parameters<typeof getHeader>[0]): string {
  return (
    getHeader(event, 'cf-connecting-ip') ||
    getRequestIP(event, { xForwardedFor: true }) ||
    'unknown'
  );
}

async function hashIp(ip: string): Promise<string> {
  const { contactIpHashSecret } = useRuntimeConfig();
  const secret = String(contactIpHashSecret || 'local-development-only');

  if (isProduction && secret === 'local-development-only') {
    throw createError({
      statusCode: 503,
      statusMessage: 'The contact service is not configured.',
    });
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function enforceContactRateLimit(ip: string, namespace = 'contact'): Promise<void> {
  const key = `${namespace}:${await hashIp(ip)}`;
  const now = Date.now();
  const existing = rateLimits.get(key);

  if (!existing || existing.resetAt <= now) {
    if (rateLimits.size >= MAX_RATE_LIMIT_ENTRIES) {
      const oldestKey = rateLimits.keys().next().value;
      if (oldestKey) rateLimits.delete(oldestKey);
    }
    rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return;
  }

  existing.count += 1;
  if (existing.count > RATE_LIMIT_MAX_REQUESTS) {
    throw createError({
      statusCode: 429,
      statusMessage: 'Too many enquiries. Please try again later.',
    });
  }
}

export async function verifyContactTurnstile(token: string, ip: string, action = 'contact'): Promise<void> {
  const { turnstileSecretKey, contactTurnstileRequired } = useRuntimeConfig();
  const required = contactTurnstileRequired;

  if (!turnstileSecretKey) {
    if (required || isProduction) {
      throw createError({
        statusCode: 503,
        statusMessage: 'The contact service is not configured.',
      });
    }
    return;
  }

  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Please complete the security check.' });
  }

  const result = await $fetch<TurnstileResult>(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      body: new URLSearchParams({
        secret: String(turnstileSecretKey),
        response: token,
        remoteip: ip,
      }),
    },
  );

  if (!result.success || (result.action && result.action !== action)) {
    throw createError({ statusCode: 400, statusMessage: 'Security check failed. Please try again.' });
  }
}
