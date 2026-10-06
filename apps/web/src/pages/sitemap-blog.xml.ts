import type { APIRoute } from 'astro';
import { getPublishedPosts } from '@web/utils/blog-posts';

// Blog pages are rendered on request, so the build-time sitemap cannot list
// them. This sitemap is linked from sitemap-index.xml.
export const prerender = false;

export const GET: APIRoute = async ({ site }) => {
  const posts = await getPublishedPosts();
  const base = site ?? new URL('https://tilanavantonder.co.za');
  const entries = [
    { loc: new URL('/blog', base).href, lastmod: posts[0]?.updatedAt },
    ...posts.map((post) => ({ loc: new URL(`/blog/${post.slug}`, base).href, lastmod: post.updatedAt })),
  ];
  const urls = entries
    .map(({ loc, lastmod }) => `<url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${lastmod.toISOString()}</lastmod>` : ''}</url>`)
    .join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' },
  });
};

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
