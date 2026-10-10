import 'server-only';
import { serverConfig } from '@/server/config';
import { HttpError } from '@/server/http';

/*
 * Read-only PostHog queries (SQL) for the Website page. The personal API key
 * stays on the server. Answers are kept for a short while: PostHog limits how
 * many queries a project may run (240 a minute, 3 at the same time).
 */

export interface PostHogSettings { apiKey: string; projectId: string; host: string }

/** The PostHog settings, or null while the key or project ID is missing. */
export function postHogSettings(): PostHogSettings | null {
  const config = serverConfig();
  const projectId = config.posthogProjectId.trim();
  const apiKey = config.posthogPersonalApiKey.trim();
  if (!apiKey || !/^\d+$/.test(projectId)) return null;
  return { apiKey, projectId, host: config.posthogHost.replace(/\/+$/, '') };
}

type Row = unknown[];
const cache = new Map<string, { at: number; rows: Promise<Row[]> }>();
let running = 0;
const queue: (() => void)[] = [];

/** At most three queries at once, like PostHog allows. */
async function slot<T>(work: () => Promise<T>): Promise<T> {
  if (running >= 3) await new Promise<void>((resolve) => queue.push(resolve));
  running += 1;
  try {
    return await work();
  } finally {
    running -= 1;
    queue.shift()?.();
  }
}

async function runQuery(settings: PostHogSettings, name: string, sql: string): Promise<Row[]> {
  const response = await fetch(`${settings.host}/api/projects/${settings.projectId}/query/`, {
    method: 'POST',
    headers: { authorization: `Bearer ${settings.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query: sql }, name: `admin: ${name}` }),
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => null) as { results?: unknown; detail?: unknown; error?: unknown } | null;
  if (!response.ok) {
    const detail = typeof body?.detail === 'string' ? body.detail : typeof body?.error === 'string' ? body.error : `HTTP ${response.status}`;
    if (response.status === 401 || response.status === 403) throw new HttpError(502, `PostHog refused the key (${detail}). Check POSTHOG_PERSONAL_API_KEY has “Query: Read” for project ${settings.projectId}.`);
    if (response.status === 429) throw new HttpError(503, 'PostHog asked us to slow down. Try again in a minute.');
    throw new HttpError(502, `PostHog query “${name}” failed: ${detail}`);
  }
  if (!Array.isArray(body?.results)) throw new HttpError(502, `PostHog query “${name}” returned no rows.`);
  return body.results.filter((row): row is Row => Array.isArray(row));
}

/** Runs a PostHog SQL query, reusing an answer younger than `maxAgeMs`. */
export function postHogQuery(settings: PostHogSettings, name: string, sql: string, maxAgeMs: number): Promise<Row[]> {
  const key = `${settings.projectId}\n${sql}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.rows;
  const rows = slot(() => runQuery(settings, name, sql));
  cache.set(key, { at: Date.now(), rows });
  // A failed answer is not kept, so the next visit tries again.
  rows.catch(() => { if (cache.get(key)?.rows === rows) cache.delete(key); });
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return rows;
}

/** Test helper: forget kept answers. */
export function clearPostHogCache(): void {
  cache.clear();
}

export const num = (value: unknown): number => (typeof value === 'number' ? value : Number(value) || 0);
export const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value));
