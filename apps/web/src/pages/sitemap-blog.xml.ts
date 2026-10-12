import type { APIRoute } from 'astro';
import { getPublishedPosts } from '@web/utils/blog-posts';
import { newest, sitemapResponse, type SitemapEntry } from '@web/utils/sitemap';

// The blog pages are rendered on request, so the build-time
// sitemap cannot list them. This sitemap is linked from sitemap-index.xml.
export const prerender = false;

export const GET: APIRoute = async ({ site }) => {
  // If the admin cannot be reached, still list the blog page itself.
  const posts = await getPublishedPosts().catch(() => []);
  const entries: SitemapEntry[] = [
    { path: '/blog', lastmod: newest(posts.map((post) => post.updatedAt)) },
    ...posts.map((post) => ({ path: `/blog/${post.slug}`, lastmod: post.updatedAt })),
  ];
  return sitemapResponse(entries, site);
};
