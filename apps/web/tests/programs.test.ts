import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicProgram } from '@tilana/contracts/public-programs';
import { programIcon, toProducts, toSiteProgram, toSitePrograms } from '@web/site/programs';

function program(overrides: Partial<PublicProgram> = {}): PublicProgram {
  return {
    slug: 'move',
    name: 'Beginner',
    title: 'Build a confident foundation.',
    summary: 'A welcoming introduction to strength.',
    description: 'Longer description.',
    audience: 'New or returning',
    tags: ['Strength'],
    tone: 'terracotta',
    illustration: 'barbell',
    series: 'strength',
    step: 1,
    marker: 'Start here',
    volumeNumber: 1,
    priceCents: 39900,
    currency: 'ZAR',
    ...overrides,
  };
}

describe('programs from the admin, shaped for the website', () => {
  it('passes on the sneak peek pictures, and copes with an older admin without them', () => {
    const preview = {
      pageCount: 16,
      pages: [
        { url: 'https://media.test/programs/p/page-1.webp', page: 1, width: 640, height: 905, blurred: false },
        { url: 'https://media.test/programs/p/page-8-blurred.webp', page: 8, width: 640, height: 905, blurred: true },
      ],
    };
    expect(toSiteProgram(program({ preview })).preview).toEqual(preview);
    expect(toSiteProgram(program({ preview: null })).preview).toBeNull();
    expect(toSiteProgram(program()).preview).toBeNull();
  });

  it('passes on "What\'s inside", and copes with an older admin without it', () => {
    expect(toSiteProgram(program({ highlights: ['6 weeks', 'Dumbbells'] })).highlights).toEqual(['6 weeks', 'Dumbbells']);
    expect(toSiteProgram(program()).highlights).toEqual([]);
  });

  it('maps a program from the admin', () => {
    const p = toSiteProgram(program({ slug: 'beginner-volume-1' }));
    expect(p).toMatchObject({
      key: 'beginner-volume-1',
      slug: 'beginner-volume-1',
      label: 'Beginner · Volume 1',
      volume: 'Volume 1',
      volumeNumber: 1,
      priceCents: 39900,
      short: 'A welcoming introduction to strength.',
      level: 'New or returning',
      illustration: 'barbell',
      icon: 'dumbbell',
      step: 1,
    });
  });

  it('picks the drawing and icon from the illustration and step', () => {
    expect(programIcon('barbell', 2)).toBe('stairs');
    expect(programIcon('barbell', 3)).toBe('bolt');
    expect(programIcon('barbell', null)).toBe('dumbbell');
    expect(programIcon('breath', null)).toBe('breath');
    expect(programIcon('plate', null)).toBe('bowl');
    const focus = toSiteProgram(program({ slug: 'reconnect', illustration: 'breath', series: 'focus', step: null }));
    expect(focus.step).toBeUndefined();
    expect(focus.icon).toBe('breath');
  });

  it('makes one basket product per program, naming later volumes', () => {
    const programs = toSitePrograms([
      program({ slug: 'beginner-volume-1' }),
      program({ slug: 'beginner-volume-2', volumeNumber: 2, priceCents: 45900 }),
    ]);
    expect(toProducts(programs)).toEqual([
      { slug: 'beginner-volume-1', key: 'beginner-volume-1', name: 'Beginner', label: 'Beginner · Volume 1', volume: 'Volume 1', title: 'Build a confident foundation.', priceCents: 39900, tone: 'terracotta', illustration: 'barbell', step: 1 },
      { slug: 'beginner-volume-2', key: 'beginner-volume-2', name: 'Beginner Vol. 2', label: 'Beginner · Volume 2', volume: 'Volume 2', title: 'Build a confident foundation.', priceCents: 45900, tone: 'terracotta', illustration: 'barbell', step: 1 },
    ]);
  });
});

describe('loading the programs for a page', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('DEV', false);
    vi.stubEnv('PUBLIC_API_BASE_URL', 'https://admin.example.test');
    vi.stubGlobal('caches', undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('reads the public programs endpoint', async () => {
    const fetchMock = vi.fn(async () => Response.json({ programs: [program()] }));
    vi.stubGlobal('fetch', fetchMock);
    const { loadSitePrograms } = await import('@web/utils/programs');
    const result = await loadSitePrograms();
    expect(result.ok).toBe(true);
    expect(result.programs.map((p) => p.slug)).toEqual(['move']);
    expect(fetchMock).toHaveBeenCalledWith('https://admin.example.test/api/public/programs', expect.objectContaining({
      headers: expect.objectContaining({ 'x-request-id': expect.stringMatching(/^web-[0-9a-f-]{36}$/) }),
    }));
  });

  it('treats an HTML page (the wrong app at PUBLIC_API_BASE_URL) as a failure and logs its request ID', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!DOCTYPE html><p>Not found</p>', { headers: { 'content-type': 'text/html' } })));
    const { loadSitePrograms } = await import('@web/utils/programs');
    expect(await loadSitePrograms()).toEqual({ programs: [], ok: false });
    expect(String(errors.mock.calls[0]?.[0])).toMatch(/Programs could not be loaded: .*expected JSON.*requestId=web-/);
  });

  it('renders without programs instead of failing when the API is down and nothing is saved', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
    const { loadSitePrograms } = await import('@web/utils/programs');
    expect(await loadSitePrograms()).toEqual({ programs: [], ok: false });
  });

  it('rejects a response that does not match the contract', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ programs: [{ slug: 'move' }] })));
    const { loadSitePrograms } = await import('@web/utils/programs');
    expect(await loadSitePrograms()).toEqual({ programs: [], ok: false });
  });
});
