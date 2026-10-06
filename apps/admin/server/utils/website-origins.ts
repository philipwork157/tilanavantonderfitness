/** Parse NUXT_WEBSITE_ORIGINS ("https://a.com,http://localhost:4321") into exact origins. */
export function parseOrigins(raw: string | undefined | null): string[] {
  return (raw ?? '')
    .split(/[\s,]+/)
    .map(value => value.trim().replace(/\/+$/, ''))
    .filter(value => /^https?:\/\/[^/]+$/.test(value));
}

/** Public website endpoints that the Astro site calls from the browser. */
export const PUBLIC_WEBSITE_PATHS = new Set([
  '/api/contact',
  '/api/newsletter/subscribe',
  '/api/newsletter/confirm',
  '/api/newsletter/unsubscribe',
]);
