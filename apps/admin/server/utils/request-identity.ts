import type { H3Event } from 'h3';
import { isIP } from 'node:net';

/** Use the configured ingress header, or the direct/local-development connection. */
export function getTrustedRequestIp(event: H3Event): string {
  const headerName = String(useRuntimeConfig(event).trustedClientIpHeader || '').trim().toLowerCase();
  const candidate = headerName ? getHeader(event, headerName) : getRequestIP(event);
  const ip = String(candidate || '').trim();

  // Nuxt's local dev proxy uses a Unix socket, which has no network address.
  // Give that local-only transport one shared loopback rate-limit identity.
  // Never trust forwarding headers or allow this fallback on a Fly deployment.
  if (!headerName && !ip && process.env.NODE_ENV === 'development' && !process.env.FLY_APP_NAME) {
    const socket = event.node.req.socket;
    const localSocket = !socket.remoteAddress && !socket.localAddress && !socket.remotePort
      && socket.readable && socket.writable && Object.keys(socket.address() || {}).length === 0;
    if (localSocket) return '127.0.0.1';
  }

  if (!ip || !isIP(ip)) {
    throw createError({ statusCode: 403, statusMessage: 'Trusted request identity is unavailable.' });
  }
  return ip;
}
