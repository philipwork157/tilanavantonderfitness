/**
 * Which website this build is: the live one, or the development copy
 * (PUBLIC_SITE_ENVIRONMENT, checked by the deploy workflow). Local `astro dev`
 * counts as development.
 */
export const SITE_ENVIRONMENT: 'production' | 'development' =
  (import.meta.env.PUBLIC_SITE_ENVIRONMENT || (import.meta.env.DEV ? 'development' : 'production')) === 'production'
    ? 'production'
    : 'development';

/** The development copy must never show up in search results. */
export const isLiveSite = SITE_ENVIRONMENT === 'production';

/** robots.txt for this build: the live site welcomes search engines, the development copy keeps them out. */
export function robotsTxt(live: boolean, sitemapUrl: string): string {
  return live
    ? `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl}\n`
    : 'User-agent: *\nDisallow: /\n';
}
