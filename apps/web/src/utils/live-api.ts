import { publicApiUrl } from './public-api';

/** How long a copy is used before asking the admin API again. */
export const LIVE_FRESH_FOR_MS = 5 * 60 * 1000;
/** How long a copy is kept as a fallback for when the admin API is down. */
const KEEP_FOR_SECONDS = 7 * 24 * 60 * 60;

interface Snapshot {
  fetchedAt: number;
  body: unknown;
}

/**
 * Reads a public admin API endpoint live, for pages rendered on request.
 *
 * Copies are kept in this Worker's memory and in Cloudflare's cache (shared by
 * every visitor in that data centre). After five minutes the next visit asks
 * the API again; if the API is unreachable the last good copy is used.
 * `astro dev` always reads the API so edits show immediately.
 */
export function createLiveLoader<T>(options: { path: string; label: string; parse: (body: unknown) => T; timeoutMs?: number }) {
  let memory: Snapshot | undefined;

  return async function load(): Promise<T> {
    const url = publicApiUrl(options.path);
    const fetchBody = () => fetchJson(url, options.label, options.timeoutMs ?? 8000);
    if (import.meta.env.DEV) return options.parse(await fetchBody());

    const now = Date.now();
    if (memory && isFresh(memory, now)) return options.parse(memory.body);

    const cache = edgeCache();
    const cacheKey = new Request(`${url}?copy=v1`);
    const saved = await readSnapshot(cache, cacheKey);
    const stored = newest(memory, saved);
    if (stored && isFresh(stored, now)) {
      memory = stored;
      return options.parse(stored.body);
    }

    try {
      const snapshot: Snapshot = { fetchedAt: now, body: await fetchBody() };
      const value = options.parse(snapshot.body);
      memory = snapshot;
      await writeSnapshot(cache, cacheKey, snapshot);
      return value;
    } catch (error) {
      if (!stored) throw error;
      console.warn(`[api] ${options.label}: serving the last saved copy from ${new Date(stored.fetchedAt).toISOString()}.`);
      return options.parse(stored.body);
    }
  };
}

function newest(a?: Snapshot, b?: Snapshot): Snapshot | undefined {
  if (!a || !b) return a ?? b;
  return a.fetchedAt >= b.fetchedAt ? a : b;
}

function isFresh(snapshot: Snapshot, now: number): boolean {
  return now - snapshot.fetchedAt < LIVE_FRESH_FOR_MS;
}

/**
 * Each call sends its own request ID (x-request-id); the admin logs the same
 * ID, so a failure here can be matched to the admin's log line.
 */
async function fetchJson(url: string, label: string, timeoutMs: number): Promise<unknown> {
  const requestId = `web-${crypto.randomUUID()}`;
  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'x-request-id': requestId },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const type = response.headers.get('content-type') ?? '';
    // An HTML page here usually means PUBLIC_API_BASE_URL points at the wrong app.
    if (!type.includes('json')) throw new Error(`expected JSON, got ${type || 'no content type'}`);
    return await response.json();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[api] ${label} could not be loaded: GET ${url} failed (${reason}) after ${Date.now() - started}ms, requestId=${requestId}`);
    throw new Error(`Could not load ${label} from ${url} (${reason}, requestId ${requestId}).`, { cause: error });
  }
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
