/**
 * Sitemaps for the pages rendered on request. The build-time sitemap
 * (@astrojs/sitemap) only knows the prebuilt pages, so these are linked from
 * sitemap-index.xml as extra sitemaps (astro.config.mjs).
 */
export type SitemapEntry = { path: string; lastmod?: Date };

/** The live site address; the development copy also lists live addresses (it is never indexed). */
export const SITE_URL = new URL('https://tilanavantonder.co.za');

/** A sitemap response; search engines may reuse it for five minutes, like the pages. */
export function sitemapResponse(entries: SitemapEntry[], site: URL | undefined): Response {
  const base = site ?? SITE_URL;
  const urls = entries
    .map(({ path, lastmod }) => `<url><loc>${escapeXml(new URL(path, base).href)}</loc>${lastmod ? `<lastmod>${lastmod.toISOString()}</lastmod>` : ''}</url>`)
    .join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
}

/** A page's canonical path: no ".html", "index" or trailing slash (/about.html and /about/ → /about). */
export function canonicalPath(pathname: string): string {
  const path = pathname.replace(/\.html$/, '').replace(/\/index$/, '/').replace(/\/+$/, '');
  return path || '/';
}

/** The newest date in a list, for a listing page's lastmod. */
export function newest(dates: Date[]): Date | undefined {
  return dates.reduce<Date | undefined>((latest, date) => (!latest || date > latest ? date : latest), undefined);
}

export function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
