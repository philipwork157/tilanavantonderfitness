import { publicCatalogueVolumeResponseSchema, type PublicCatalogueVolumeDetail } from '@tilana/contracts/catalogue';
import { writeBasket } from './basket';

export type BasketVolumeResult =
  | { state: 'available'; volume: PublicCatalogueVolumeDetail }
  | { state: 'unavailable' }
  | { state: 'retryable' };

/** Only valid catalogue evidence can remove a selection, never an outage or proxy response. */
export async function fetchBasketVolume(apiUrl: string, slug: string): Promise<BasketVolumeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    // A unique query avoids shared stale catalogue entries, including after a price conflict.
    const url = new URL(`${apiUrl.replace(/\/+$/, '')}/${encodeURIComponent(slug)}`);
    url.searchParams.set('checkoutRefresh', crypto.randomUUID());
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
    const body: unknown = await response.json();
    if (!response.ok) {
      // Match this endpoint's explicit not-found response, not arbitrary HTML/proxy 404s.
      const missing = response.status === 404 && body && typeof body === 'object'
        && 'statusMessage' in body && body.statusMessage === 'Program volume not found.';
      return { state: missing ? 'unavailable' : 'retryable' };
    }
    const parsed = publicCatalogueVolumeResponseSchema.safeParse(body);
    if (!parsed.success || parsed.data.volume.slug !== slug) return { state: 'retryable' };
    return parsed.data.volume.isAvailable ? { state: 'available', volume: parsed.data.volume } : { state: 'unavailable' };
  } catch {
    return { state: 'retryable' };
  } finally { clearTimeout(timer); }
}

/** Do not persist a partial basket when any programme could not be authoritatively checked. */
export async function refreshBasketCatalogue(apiUrl: string, slugs: string[]) {
  const results = await Promise.all(slugs.map(slug => fetchBasketVolume(apiUrl, slug)));
  if (results.some(result => result.state === 'retryable')) return { state: 'retryable' as const };
  const volumes = results.flatMap(result => result.state === 'available' ? [result.volume] : []);
  if (volumes.length !== slugs.length) writeBasket(volumes.map(volume => volume.slug));
  return { state: 'ready' as const, volumes };
}
