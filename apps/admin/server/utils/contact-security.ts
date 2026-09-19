import { abusePolicies, enforceSharedLimit } from '@server/services/abuse-controls';
import { getTrustedRequestIp } from '@server/utils/request-identity';

interface TurnstileResult {
  success: boolean;
  action?: string;
  'error-codes'?: string[];
}

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  });

  return origin;
}

export function handleContactOptions(event: Parameters<typeof getHeader>[0]): null {
  applyContactCors(event);
  setResponseStatus(event, 204);
  return null;
}

export function getContactRequestIp(event: Parameters<typeof getHeader>[0]): string {
  return getTrustedRequestIp(event);
}

export async function enforceContactRateLimit(ip: string, namespace = 'contact'): Promise<void> {
  await enforceSharedLimit(ip, abusePolicies.contact(namespace), 'Too many requests. Please try again later.');
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
