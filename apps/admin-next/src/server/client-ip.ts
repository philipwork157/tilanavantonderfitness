/**
 * The visitor's IP address, for rate limits and (masked) logs.
 *
 * Fly's edge sets Fly-Client-IP itself, replacing anything the visitor sent,
 * so it is the one to trust in production. X-Forwarded-For is only a fallback:
 * proxies add the address they saw to the END, while earlier entries are
 * whatever the visitor typed, so only the last entry is used.
 */
export function clientIp(request: Request): string {
  const fly = request.headers.get('fly-client-ip')?.trim();
  if (fly) return fly;
  const hops = request.headers.get('x-forwarded-for')?.split(',').map((hop) => hop.trim()).filter(Boolean);
  return hops?.at(-1) || request.headers.get('x-real-ip')?.trim() || 'unknown';
}
