import type { H3Event } from 'h3';
import { getHeader, getRequestHost } from 'h3';
import { abusePolicies, claimSharedAllowance, clearSharedAllowance, enforceSharedLimit } from '@server/services/abuse-controls';
import { getTrustedRequestIp } from '@server/utils/request-identity';

export function enforceSameOrigin(event: H3Event) {
  const origin = getHeader(event, 'origin');
  const host = getRequestHost(event);

  if (!origin) {
    throw createError({ statusCode: 403, statusMessage: 'Request origin is required.' });
  }

  try {
    if (new URL(origin).host !== host) throw new Error('Origin mismatch');
  } catch {
    throw createError({ statusCode: 403, statusMessage: 'Request origin is not allowed.' });
  }
}

export async function enforceLoginRateLimit(event: H3Event) {
  await enforceSharedLimit(
    getTrustedRequestIp(event),
    abusePolicies.loginIp,
    'Too many sign-in attempts. Please wait and try again.',
  );
}

/** Return false silently so recipient existence is never disclosed. */
export function claimLoginRecipient(email: string) {
  return claimSharedAllowance(email, abusePolicies.loginRecipient);
}

export function clearLoginRateLimit(event: H3Event) {
  return clearSharedAllowance(getTrustedRequestIp(event), abusePolicies.loginIp);
}
