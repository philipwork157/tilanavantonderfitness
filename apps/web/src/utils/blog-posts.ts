import { publicBlogPostsResponseSchema, type PublicBlogPost } from '@tilana/contracts/blog';
import { publicApiUrl } from './public-api';

let cached: Promise<PublicBlogPost[]> | undefined;

/**
 * Published posts from the admin API, read when the site is built (and on
 * each page load during `astro dev`). A failed request fails the build so a
 * broken API can never publish an empty blog.
 */
export function getPublishedPosts(): Promise<PublicBlogPost[]> {
  if (import.meta.env.DEV || !cached) cached = loadPosts();
  return cached;
}

async function loadPosts(): Promise<PublicBlogPost[]> {
  const url = publicApiUrl('/api/public/blog-posts');
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`Could not load blog posts from ${url} (HTTP ${response.status}).`);
  }
  return publicBlogPostsResponseSchema.parse(await response.json()).posts;
}
