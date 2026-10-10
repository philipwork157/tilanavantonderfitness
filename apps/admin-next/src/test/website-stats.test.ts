import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPostHogCache, postHogQuery, postHogSettings } from '@/server/services/posthog';
import { fillDays, sourceName } from '@/server/services/website-stats';

const settings = { apiKey: 'phx_test', projectId: '300236', host: 'https://eu.posthog.com' };

describe('website stats', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    clearPostHogCache();
  });

  it('is off until the key and a numeric project ID are set', () => {
    vi.stubEnv('POSTHOG_PERSONAL_API_KEY', '');
    vi.stubEnv('POSTHOG_PROJECT_ID', '300236');
    expect(postHogSettings()).toBeNull();
    vi.stubEnv('POSTHOG_PERSONAL_API_KEY', 'phx_abc');
    vi.stubEnv('POSTHOG_PROJECT_ID', 'not-a-number');
    expect(postHogSettings()).toBeNull();
    vi.stubEnv('POSTHOG_PROJECT_ID', ' 300236 ');
    vi.stubEnv('POSTHOG_HOST', 'https://eu.posthog.com/');
    expect(postHogSettings()).toEqual({ ...settings, apiKey: 'phx_abc' });
  });

  it('asks PostHog with the key on the server and reuses fresh answers', async () => {
    const fetchMock = vi.fn(async () => Response.json({ results: [[3, 'x']] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await postHogQuery(settings, 'test', 'SELECT 1', 60_000)).toEqual([[3, 'x']]);
    expect(await postHogQuery(settings, 'test', 'SELECT 1', 60_000)).toEqual([[3, 'x']]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://eu.posthog.com/api/projects/300236/query/');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer phx_test');
    expect(JSON.parse(String(init.body))).toMatchObject({ query: { kind: 'HogQLQuery', query: 'SELECT 1' } });
  });

  it('explains a refused key, and tries again after a failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ detail: 'Invalid key' }, { status: 401 })));
    await expect(postHogQuery(settings, 'test', 'SELECT 2', 60_000)).rejects.toThrow(/refused the key.*Query: Read/);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ results: [[1]] })));
    expect(await postHogQuery(settings, 'test', 'SELECT 2', 60_000)).toEqual([[1]]);
  });

  it('gives sources friendly names', () => {
    expect(sourceName('$direct')).toBe('Direct or app');
    expect(sourceName('')).toBe('Direct or app');
    expect(sourceName('www.google.co.za')).toBe('Google');
    expect(sourceName('l.instagram.com')).toBe('Instagram');
    expect(sourceName('wa.me')).toBe('WhatsApp');
    expect(sourceName('m.facebook.com')).toBe('Facebook');
    expect(sourceName('newsletter')).toBe('Email');
    expect(sourceName('example.org')).toBe('example.org');
  });

  it('fills days without visits, in South African dates', () => {
    const today = new Date('2026-10-10T23:30:00Z'); // already 11 October in South Africa
    const days = fillDays([{ date: '2026-10-10', visitors: 4, pageviews: 9 }], 3, today);
    expect(days).toEqual([
      { date: '2026-10-09', visitors: 0, pageviews: 0 },
      { date: '2026-10-10', visitors: 4, pageviews: 9 },
      { date: '2026-10-11', visitors: 0, pageviews: 0 },
    ]);
  });
});
