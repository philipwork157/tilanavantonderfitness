import { publicBlogPostsResponseSchema, type PublicBlogPost } from '@tilana/contracts/blog';
import { publicApiUrl } from './public-api';

/** How long a copy of the posts is used before asking the admin API again. */
export const BLOG_FRESH_FOR_MS = 5 * 60 * 1000;
/** How long a copy is kept as a fallback for when the admin API is down. */
const KEEP_FOR_SECONDS = 7 * 24 * 60 * 60;

interface Snapshot {
  fetchedAt: number;
  body: unknown;
}

let memory: Snapshot | undefined;

/**
 * Published posts from the admin API, read live when a blog page is opened.
 *
 * Copies are kept in this Worker's memory and in Cloudflare's cache (shared by
 * every visitor in that data centre). After five minutes the next visit asks
 * the API again; if the API is unreachable the last good copy is used.
 * `astro dev` always reads the API so edits show immediately.
 */
export async function getPublishedPosts(): Promise<PublicBlogPost[]> {
  const url = publicApiUrl('/api/public/blog-posts');
  if (import.meta.env.DEV) return parse(await fetchPosts(url));

  const now = Date.now();
  if (memory && isFresh(memory, now)) return parse(memory.body);

  const cache = edgeCache();
  const cacheKey = new Request(`${url}?copy=v1`);
  const saved = await readSnapshot(cache, cacheKey);
  const stored = newest(memory, saved);
  if (stored && isFresh(stored, now)) {
    memory = stored;
    return parse(stored.body);
  }

  try {
    const snapshot: Snapshot = { fetchedAt: now, body: await fetchPosts(url) };
    const posts = parse(snapshot.body);
    memory = snapshot;
    await writeSnapshot(cache, cacheKey, snapshot);
    return posts;
  } catch (error) {
    if (!stored) throw error;
    console.error('Blog API unavailable, serving the last saved posts.', error);
    return parse(stored.body);
  }
}

/** Finds one published post by its address. */
export async function getPublishedPost(slug: string): Promise<PublicBlogPost | undefined> {
  return (await getPublishedPosts()).find((post) => post.slug === slug);
}

function newest(a?: Snapshot, b?: Snapshot): Snapshot | undefined {
  if (!a || !b) return a ?? b;
  return a.fetchedAt >= b.fetchedAt ? a : b;
}

function isFresh(snapshot: Snapshot, now: number): boolean {
  return now - snapshot.fetchedAt < BLOG_FRESH_FOR_MS;
}

function parse(body: unknown): PublicBlogPost[] {
  return publicBlogPostsResponseSchema.parse(body).posts;
}

async function fetchPosts(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error(`Could not load blog posts from ${url} (HTTP ${response.status}).`);
  }
  return response.json();
}

/** Cloudflare's per-data-centre cache; absent outside the Worker runtime. */
function edgeCache(): Cache | undefined {
  return (globalThis as { caches?: { default?: Cache } }).caches?.default;
}

async function readSnapshot(cache: Cache | undefined, key: Request): Promise<Snapshot | undefined> {
  try {
    const hit = await cache?.match(key);
    return hit ? ((await hit.json()) as Snapshot) : undefined;
  } catch {
    return undefined;
  }
}

async function writeSnapshot(cache: Cache | undefined, key: Request, snapshot: Snapshot): Promise<void> {
  try {
    await cache?.put(
      key,
      new Response(JSON.stringify(snapshot), {
        headers: {
          'content-type': 'application/json',
          'cache-control': `public, max-age=${KEEP_FOR_SECONDS}`,
        },
      }),
    );
  } catch {
    // Caching is an optimisation; the page still renders without it.
  }
}
