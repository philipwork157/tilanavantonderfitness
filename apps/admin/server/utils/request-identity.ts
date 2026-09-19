import type { H3Event } from 'h3';
import { isIP } from 'node:net';

/** Trust only the ingress header configured for the deployed reverse proxy. */
export function getTrustedRequestIp(event: H3Event): string {
  const headerName = String(useRuntimeConfig(event).trustedClientIpHeader || '').trim().toLowerCase();
  const candidate = headerName ? getHeader(event, headerName) : getRequestIP(event);
  const ip = String(candidate || '').trim();
  if (!ip || !isIP(ip)) {
    throw createError({ statusCode: 403, statusMessage: 'Trusted request identity is unavailable.' });
  }
  return ip;
}
