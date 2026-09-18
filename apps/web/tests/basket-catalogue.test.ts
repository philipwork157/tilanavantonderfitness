import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchBasketVolume, refreshBasketCatalogue } from '@web/scripts/basket-catalogue';
import { BASKET_STORAGE_KEY, readBasket } from '@web/scripts/basket';
import { CHECKOUT_INTENTS_STORAGE_KEY } from '@web/scripts/checkout-intent';

const slugs = ['beginner-volume-1', 'strong-volume-1'];
const apiUrl = 'https://admin.example.test/api/public/program-volumes';
let storage: Map<string, string>;
let setItem: ReturnType<typeof vi.fn>;

/** Use the public contract's full shape, not a permissive partial response. */
function volume(slug = slugs[0]!, isAvailable = true, priceCents = 39900) {
  return { id: 1, slug, volumeNumber: 1, name: 'Volume 1', description: null, priceCents, currency: 'ZAR', isAvailable,
    program: { id: 1, slug: 'beginner', name: 'Beginner', cardLabel: 'Program', headline: 'Start', description: '', accent: 'sage', cover: null, volumes: [] } };
}
function available(slug: string) { return Response.json({ volume: volume(slug) }); }
beforeEach(() => {
  storage = new Map([[BASKET_STORAGE_KEY, JSON.stringify(slugs)], [CHECKOUT_INTENTS_STORAGE_KEY, 'existing-intent']]);
  setItem = vi.fn((key: string, value: string) => storage.set(key, value));
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
});

describe('authoritative basket catalogue refresh', () => {
  it('does not let an obsolete catalogue load overwrite a newer cross-tab basket', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ volume: volume(slugs[0]!, false) })));
    expect(await refreshBasketCatalogue(apiUrl, [slugs[0]!], () => false)).toEqual({ state: 'changed' });
    expect(readBasket()).toEqual(slugs);
    expect(setItem).not.toHaveBeenCalled();
  });
  it.each([429, 500, 502, 503, 401, 403])('preserves every item when one catalogue request returns %s', async code => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(available(slugs[0]!)).mockResolvedValueOnce(Response.json({}, { status: code })));
    expect(await refreshBasketCatalogue(apiUrl, slugs)).toEqual({ state: 'retryable' });
    expect(readBasket()).toEqual(slugs);
    expect(setItem).not.toHaveBeenCalled();
    expect(storage.get(CHECKOUT_INTENTS_STORAGE_KEY)).toBe('existing-intent');
  });
  it('preserves the whole basket when all requests fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({}, { status: 503 })));
    expect(await refreshBasketCatalogue(apiUrl, slugs)).toEqual({ state: 'retryable' });
    expect(readBasket()).toEqual(slugs);
    expect(setItem).not.toHaveBeenCalled();
  });
  it.each([200, 404, 503])('treats a malformed or proxy HTML response with HTTP %s as retryable', async code => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>proxy</html>', { status: code })));
    expect(await fetchBasketVolume(apiUrl, slugs[0]!)).toEqual({ state: 'retryable' });
  });
  it('treats schema-invalid JSON and mismatched volume slugs as uncertain', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ volume: {} })).mockResolvedValueOnce(available('wrong-volume')));
    expect(await refreshBasketCatalogue(apiUrl, slugs)).toEqual({ state: 'retryable' });
    expect(readBasket()).toEqual(slugs);
  });
  it('preserves selections on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await refreshBasketCatalogue(apiUrl, slugs)).toEqual({ state: 'retryable' });
    expect(readBasket()).toEqual(slugs);
  });
  it('bounds timeout and preserves selections after abort', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
        options.signal!.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
      })));
      const result = refreshBasketCatalogue(apiUrl, slugs);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await result).toEqual({ state: 'retryable' });
      expect(readBasket()).toEqual(slugs);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
  it('removes only definitive unavailable items after every item is checked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ volume: volume(slugs[0]!, false) })).mockResolvedValueOnce(available(slugs[1]!)));
    expect(await refreshBasketCatalogue(apiUrl, slugs)).toMatchObject({ state: 'ready', volumes: [volume(slugs[1]!)] });
    expect(readBasket()).toEqual([slugs[1]]);
  });
  it('accepts explicit endpoint not-found evidence but not an arbitrary JSON 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ statusMessage: 'Program volume not found.' }, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ statusMessage: 'Proxy route missing' }, { status: 404 })));
    expect(await fetchBasketVolume(apiUrl, slugs[0]!)).toEqual({ state: 'unavailable' });
    expect(await fetchBasketVolume(apiUrl, slugs[0]!)).toEqual({ state: 'retryable' });
  });
  it('does not remove even a confirmed unavailable item while another item is uncertain', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ volume: volume(slugs[0]!, false) })).mockResolvedValueOnce(Response.json({}, { status: 503 })));
    expect(await refreshBasketCatalogue(apiUrl, slugs)).toEqual({ state: 'retryable' });
    expect(readBasket()).toEqual(slugs);
  });
  it('returns an empty confirmed basket only if every programme is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async url => Response.json({ volume: volume(new URL(url).pathname.split('/').at(-1)!, false) })));
    expect(await refreshBasketCatalogue(apiUrl, slugs)).toEqual({ state: 'ready', volumes: [] });
    expect(readBasket()).toEqual([]);
  });
  it('recovers on retry with fresh prices and distinct uncached URLs without changing intent storage', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ volume: volume(slugs[0]!, true, 49900) }))
      .mockResolvedValueOnce(Response.json({ volume: volume(slugs[0]!, true, 59900) }));
    vi.stubGlobal('fetch', fetch);
    expect(await refreshBasketCatalogue(apiUrl, [slugs[0]!])).toEqual({ state: 'retryable' });
    expect(await refreshBasketCatalogue(apiUrl, [slugs[0]!])).toMatchObject({ state: 'ready', volumes: [{ priceCents: 49900 }] });
    expect(await refreshBasketCatalogue(apiUrl, [slugs[0]!])).toMatchObject({ state: 'ready', volumes: [{ priceCents: 59900 }] });
    const urls = fetch.mock.calls.map(call => call[0]);
    expect(new Set(urls).size).toBe(3);
    for (const call of fetch.mock.calls) expect(call[1]).toMatchObject({ cache: 'no-store', signal: expect.any(AbortSignal) });
    expect(storage.get(CHECKOUT_INTENTS_STORAGE_KEY)).toBe('existing-intent');
    expect(setItem).not.toHaveBeenCalled();
  });
});
