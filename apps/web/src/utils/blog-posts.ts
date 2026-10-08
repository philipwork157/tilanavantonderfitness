import { publicBlogPostsResponseSchema, type PublicBlogPost } from '@tilana/contracts/blog';
import { createLiveLoader, LIVE_FRESH_FOR_MS } from './live-api';

/** How long a copy of the posts is used before asking the admin API again. */
export const BLOG_FRESH_FOR_MS = LIVE_FRESH_FOR_MS;

/**
 * Published posts from the admin API, read live when a blog page is opened
 * (five-minute shared cache, last good copy while the API is down).
 */
export const getPublishedPosts: () => Promise<PublicBlogPost[]> = createLiveLoader({
  path: '/api/public/blog-posts',
  label: 'Blog posts',
  parse: (body) => publicBlogPostsResponseSchema.parse(body).posts,
});

/** Finds one published post by its address. */
export async function getPublishedPost(slug: string): Promise<PublicBlogPost | undefined> {
  return (await getPublishedPosts()).find((post) => post.slug === slug);
}
