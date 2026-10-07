import { useSyncExternalStore } from 'react';
import {
  BASKET_CHANGE_EVENT,
  BASKET_STORAGE_KEY,
  MAX_BASKET_ITEMS,
  readBasket,
  writeBasket,
} from '@web/scripts/basket';
import { programs } from '../../data';

/**
 * Basket store for the React islands. The slugs live in the same browser
 * storage as the checkout scripts (`@web/scripts/basket`); the server re-checks
 * every item and price before Paystack is ever called.
 */

export type Product = { slug: string; key: string; name: string; label: string; volume: string; title: string; priceCents: number; tone: string };

export const products: Product[] = programs.map((p) => ({ slug: p.slug, key: p.key, name: p.name, label: p.label, volume: p.volume, title: p.title, priceCents: p.priceCents, tone: p.tone }));

export const productBySlug = new Map(products.map((p) => [p.slug, p]));

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

export function basketItems(slugs: string[]): Product[] {
  return slugs.map((s) => productBySlug.get(s)).filter((p): p is Product => Boolean(p));
}

export function totalCents(slugs: string[]): number {
  return basketItems(slugs).reduce((sum, p) => sum + p.priceCents, 0);
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
