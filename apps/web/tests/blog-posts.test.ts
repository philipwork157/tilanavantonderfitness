import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const post = (title: string) => ({
  slug: 'protein',
  title,
  excerpt: 'A practical look at protein.',
  category: 'Nourishment',
  bodyMarkdown: 'Protein matters.',
  coverImageUrl: null,
  coverImageAlt: null,
  coverImageWidth: null,
  coverImageHeight: null,
  closingLine: null,
  quoteText: null,
  quoteCitation: null,
  publishedAt: '2026-10-04T08:00:00.000Z',
  updatedAt: '2026-10-04T08:00:00.000Z',
});

/** Minimal stand-in for Cloudflare's caches.default. */
function fakeEdgeCache() {
  const store = new Map<string, string>();
  return {
    store,
    match: async (request: Request) => (store.has(request.url) ? new Response(store.get(request.url)) : undefined),
    put: async (request: Request, response: Response) => void store.set(request.url, await response.text()),
  };
}

let title = 'First title';
let apiUp = true;
const fetchMock = vi.fn(async () => (apiUp ? Response.json({ posts: [post(title)] }) : new Response(null, { status: 503 })));

async function loadModule() {
  vi.resetModules();
  return import('@web/utils/blog-posts');
}

describe('live blog posts with a shared cache', () => {
  beforeEach(() => {
    title = 'First title';
    apiUp = true;
    fetchMock.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T08:00:00Z'));
    vi.stubEnv('DEV', false);
    vi.stubEnv('PUBLIC_API_BASE_URL', 'https://admin.example.test');
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('caches', { default: fakeEdgeCache() });
  });
  afterEach(() => vi.useRealTimers());

  it('asks the API once and reuses the copy for five minutes', async () => {
    const { getPublishedPosts } = await loadModule();
    expect((await getPublishedPosts())[0]?.title).toBe('First title');
    title = 'Edited title';
    vi.advanceTimersByTime(4 * 60 * 1000);
    expect((await getPublishedPosts())[0]?.title).toBe('First title');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows edits once the copy is older than five minutes', async () => {
    const { getPublishedPosts } = await loadModule();
    await getPublishedPosts();
    title = 'Edited title';
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect((await getPublishedPosts())[0]?.title).toBe('Edited title');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares the copy through the edge cache when the Worker restarts', async () => {
    await (await loadModule()).getPublishedPosts();
    const { getPublishedPosts } = await loadModule();
    await getPublishedPosts();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps serving the last good copy while the API is down', async () => {
    const { getPublishedPosts } = await loadModule();
    await getPublishedPosts();
    apiUp = false;
    vi.advanceTimersByTime(60 * 60 * 1000);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await getPublishedPosts())[0]?.title).toBe('First title');
  });

  it('fails when the API is down and nothing was saved yet', async () => {
    apiUp = false;
    const { getPublishedPosts } = await loadModule();
    await expect(getPublishedPosts()).rejects.toThrow('HTTP 503');
  });

  it('finds one post by its address', async () => {
    const { getPublishedPost } = await loadModule();
    expect((await getPublishedPost('protein'))?.title).toBe('First title');
    expect(await getPublishedPost('missing')).toBeUndefined();
  });
});
