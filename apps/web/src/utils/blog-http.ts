/**
 * Browsers may reuse a blog page for a minute; the posts themselves are
 * cached on Cloudflare by getPublishedPosts.
 */
export function setBlogCacheHeaders(headers: Headers): void {
  headers.set('cache-control', 'public, max-age=60');
}
