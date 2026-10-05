/** Derives fixed backend endpoints from the single public API origin. */
export function publicApiUrl(path: string, base = import.meta.env.PUBLIC_API_BASE_URL || 'http://localhost:3001'): string {
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('PUBLIC_API_BASE_URL must be an HTTP(S) origin.');
  }
  return new URL(path, url.origin).toString();
}
