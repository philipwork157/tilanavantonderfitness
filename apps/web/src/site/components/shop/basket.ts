import { useEffect, useSyncExternalStore } from 'react';
import { publicProgramsResponseSchema } from '@tilana/contracts/public-programs';
import {
  BASKET_CHANGE_EVENT,
  BASKET_STORAGE_KEY,
  MAX_BASKET_ITEMS,
  readBasket,
  writeBasket,
} from '@web/scripts/basket';
import { publicApiUrl } from '@web/utils/public-api';
import { toProducts, toSitePrograms, type Product } from '../../programs';

/**
 * Basket store for the React islands. The slugs live in the same browser
 * storage as the checkout scripts (`@web/scripts/basket`); the server re-checks
 * every item and price before Paystack is ever called.
 */

export type { Product };

/*
 * The programs for sale, for the islands. Pages that already loaded them on
 * the server pass them in (`useCatalogue(products)`); everywhere else they
 * are fetched from the admin API the first time an island needs them.
 */
const NO_PRODUCTS: Product[] = [];
const CATALOGUE_EVENT = 'tilana-site:catalogue';
let catalogue: Product[] | null = null;
let catalogueRequest: Promise<boolean> | null = null;

function setCatalogue(next: Product[]) {
  catalogue = next;
  window.dispatchEvent(new Event(CATALOGUE_EVENT));
}

/** Loads the programs once per page (again after a failure). Resolves to false if they could not be loaded. */
export function loadCatalogue(): Promise<boolean> {
  if (catalogue) return Promise.resolve(true);
  catalogueRequest ??= fetch(publicApiUrl('/api/public/programs'), { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { programs } = publicProgramsResponseSchema.parse(await response.json());
      setCatalogue(toProducts(toSitePrograms(programs)));
      return true;
    })
    .catch((error: unknown) => {
      console.error('Programs could not be loaded.', error);
      return false;
    })
    .finally(() => {
      catalogueRequest = null;
    });
  return catalogueRequest;
}

function subscribeCatalogue(callback: () => void) {
  window.addEventListener(CATALOGUE_EVENT, callback);
  return () => window.removeEventListener(CATALOGUE_EVENT, callback);
}

/**
 * Programs for sale. `initial` (from the server) is used straight away;
 * without it the list starts empty and fills in once loaded (when `load` is true).
 */
export function useCatalogue(initial?: Product[], load = true): Product[] {
  if (initial?.length && !catalogue && typeof window !== 'undefined') catalogue = initial;
  const list = useSyncExternalStore(subscribeCatalogue, () => catalogue ?? initial ?? NO_PRODUCTS, () => initial ?? NO_PRODUCTS);
  useEffect(() => {
    if (load) void loadCatalogue();
  }, [load]);
  return list;
}

export function productMap(products: Product[]): Map<string, Product> {
  return new Map(products.map((p) => [p.slug, p]));
}

export { MAX_BASKET_ITEMS };

const OPEN_EVENT = 'tilana-site:open-basket';
const EMPTY: string[] = [];
let cache: string[] | null = null;

export function getBasket(): string[] {
  if (cache === null) cache = readBasket();
  return cache;
}

function save(slugs: string[]) {
  cache = writeBasket(slugs);
}

export type AddResult = 'added' | 'exists' | 'full';

export function addToBasket(slug: string): AddResult {
  const basket = getBasket();
  if (basket.includes(slug)) return 'exists';
  if (basket.length >= MAX_BASKET_ITEMS) return 'full';
  save([...basket, slug]);
  return 'added';
}

export function removeFromBasket(slug: string) {
  save(getBasket().filter((s) => s !== slug));
}

function subscribe(callback: () => void) {
  const update = (next: string[]) => {
    // Keep the same array when nothing changed, so React does not re-render needlessly.
    if (!cache || next.join() !== cache.join()) cache = next;
    callback();
  };
  // Changes in this tab carry the new list (works even if storage is unavailable).
  const onChange = (event: Event) => {
    const slugs = (event as CustomEvent<{ slugs?: string[] }>).detail?.slugs;
    update(Array.isArray(slugs) ? slugs : readBasket());
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === BASKET_STORAGE_KEY || event.key === null) update(readBasket());
  };
  window.addEventListener(BASKET_CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(BASKET_CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** Basket slugs, shared live between every island on the page (and other tabs). */
export function useBasket(): string[] {
  return useSyncExternalStore(subscribe, getBasket, () => EMPTY);
}

export function basketItems(slugs: string[], products: Product[]): Product[] {
  const bySlug = productMap(products);
  return slugs.map((s) => bySlug.get(s)).filter((p): p is Product => Boolean(p));
}

export function totalCents(slugs: string[], products: Product[]): number {
  return basketItems(slugs, products).reduce((sum, p) => sum + p.priceCents, 0);
}

/** Deterministic rand formatting (no locale differences between server and browser). */
export function rand(cents: number): string {
  const whole = Math.floor(cents / 100);
  const rest = cents % 100;
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `R${grouped}${rest ? `.${String(rest).padStart(2, '0')}` : ''}`;
}

export type OpenDetail = { added?: string[]; full?: boolean };

export function openBasket(detail: OpenDetail = {}) {
  window.dispatchEvent(new CustomEvent<OpenDetail>(OPEN_EVENT, { detail }));
}

export function onOpenBasket(handler: (detail: OpenDetail) => void) {
  const listener = (event: Event) => handler((event as CustomEvent<OpenDetail>).detail ?? {});
  window.addEventListener(OPEN_EVENT, listener);
  return () => window.removeEventListener(OPEN_EVENT, listener);
}

/** Adds several programs (e.g. from the quiz) and opens the basket to confirm. */
export function addAndOpen(slugs: string[]) {
  const added: string[] = [];
  let full = false;
  for (const slug of slugs) {
    const result = addToBasket(slug);
    if (result === 'added') added.push(slug);
    if (result === 'full') full = true;
  }
  openBasket({ added, full });
}
