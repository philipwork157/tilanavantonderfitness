import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPostHogCache, postHogQuery, postHogSettings } from '@/server/services/posthog';
import type { Database } from '@tilana/db';
import { change, channelFor, fillDays, sourceName, websiteStats } from '@/server/services/website-stats';

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

  it('names channels like PostHog when its own channel is unavailable', () => {
    expect(channelFor('$direct')).toBe('Direct');
    expect(channelFor('www.google.com')).toBe('Organic Search');
    expect(channelFor('l.instagram.com')).toBe('Organic Social');
    expect(channelFor('newsletter')).toBe('Email');
    expect(channelFor('example.org')).toBe('Referral');
  });

  it('compares with the period before', () => {
    expect(change(15, 10)).toBe(0.5);
    expect(change(5, 10)).toBe(-0.5);
    expect(change(3, 0)).toBeNull();
  });

  it('uses PostHog session data, and estimates from page views when it cannot be read', async () => {
    const asked: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { name: string; query: { query: string } };
      asked.push(body.name);
      if (body.query.query.includes('session.$')) return Response.json({ detail: 'Unknown table session' }, { status: 400 });
      if (body.name === 'admin: overview (estimate)') return Response.json({ results: [[1, 4, 12, 5, 80, 0.4], [0, 2, 6, 2, 40, 0.5]] });
      if (body.name === 'admin: channels (estimate)') return Response.json({ results: [['', 'www.google.com', 3, 9, 4, 0.25], ['', '$direct', 1, 3, 1, 1]] });
      return Response.json({ results: [] });
    }));
    const stats = await websiteStats({} as Database, settings, 7, 'production');
    expect(stats.approximate).toBe(true);
    expect(stats.errors).toEqual([]);
    expect(stats.totals).toMatchObject({ visitors: 4, pageviews: 12, sessions: 5, duration: 80, bounceRate: 0.4 });
    expect(stats.changes.visitors).toBe(1);
    expect(stats.changes.bounceRate).toBeCloseTo(-0.1);
    expect(stats.channels).toEqual([
      { name: 'Organic Search', visitors: 3, pageviews: 9, sessions: 4, bounceRate: 0.25 },
      { name: 'Direct', visitors: 1, pageviews: 3, sessions: 1, bounceRate: 1 },
    ]);
    expect(stats.sources?.map((row) => row.name)).toEqual(['Google', 'Direct or app']);
    expect(asked).toContain('admin: overview');
    expect(stats.postHogUrl).toBe('https://eu.posthog.com/project/300236/web');
  });
});
