import { catalogueSlugSchema } from '@tilana/contracts/catalogue';
import { clearCompletedCheckoutIntent } from './checkout-intent';
import { sameBasketSelection } from './checkout-selection';

export const BASKET_STORAGE_KEY = 'tilana-programme-basket';
export const PENDING_BASKET_STORAGE_KEY = 'tilana-pending-programme-basket';
export const BASKET_CHANGE_EVENT = 'tilana:basket-change';
export const MAX_BASKET_ITEMS = 10;

type PendingBasket = {
  reference: string;
  slugs: string[];
};

function validSlugs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((slug): slug is string => catalogueSlugSchema.safeParse(slug).success))]
    .slice(0, MAX_BASKET_ITEMS);
}

export function readBasket(): string[] {
  try {
    return validSlugs(JSON.parse(localStorage.getItem(BASKET_STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export function writeBasket(slugs: string[]): string[] {
  const next = validSlugs(slugs);
  try {
    localStorage.setItem(BASKET_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The UI will fall back to an empty basket when browser storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(BASKET_CHANGE_EVENT, { detail: { slugs: next } }));
  return next;
}

export function addToBasket(slug: string): string[] {
  const parsed = catalogueSlugSchema.safeParse(slug);
  if (!parsed.success) return readBasket();
  return writeBasket([...readBasket(), parsed.data]);
}

export function removeFromBasket(slug: string): string[] {
  return writeBasket(readBasket().filter(item => item !== slug));
}

export function rememberPendingBasket(reference: string, slugs: string[]): void {
  const key = pendingBasketStorageKey(reference);
  const snapshot = validSlugs(slugs);
  const existing = localStorage.getItem(key);
  if (existing) {
    const value: unknown = JSON.parse(existing);
    if (!Array.isArray(value) || validSlugs(value).length !== value.length || !sameBasketSelection(validSlugs(value), snapshot)) {
      throw new Error('This payment already has a different basket. Please contact us before retrying.');
    }
  }
  // Separate atomic keys cannot overwrite another tab's reference. Fail closed if persistence fails.
  localStorage.setItem(key, JSON.stringify(snapshot));
}

/** Reference-scoped records avoid read/modify/write races in a shared pending-reference map. */
export function pendingBasketStorageKey(reference: string) {
  if (!/^[A-Za-z0-9.=-]{10,160}$/.test(reference)) throw new Error('Invalid checkout reference.');
  return `${PENDING_BASKET_STORAGE_KEY}:${reference}`;
}

/** Clear only confirmed paid selections, retaining other references and supporting legacy storage. */
export async function clearPaidBasket(reference: string): Promise<void> {
  await clearCompletedCheckoutIntent(reference);
  const clear = () => {
    try {
      const key = pendingBasketStorageKey(reference);
      const raw = localStorage.getItem(key);
      let legacy: Partial<PendingBasket> | null = null;
      try { legacy = JSON.parse(localStorage.getItem(PENDING_BASKET_STORAGE_KEY) ?? 'null') as Partial<PendingBasket> | null; } catch { /* A malformed legacy record must not block a valid new reference. */ }
      const value: unknown = raw ? JSON.parse(raw) : legacy?.reference === reference ? legacy.slugs : null;
      if (!Array.isArray(value) || validSlugs(value).length !== value.length) return;
      const paidSlugs = new Set(validSlugs(value));
      writeBasket(readBasket().filter(slug => !paidSlugs.has(slug)));
      localStorage.removeItem(key);
      if (legacy?.reference === reference) localStorage.removeItem(PENDING_BASKET_STORAGE_KEY);
    } catch {
      // A malformed local value must not affect the payment confirmation screen.
    }
  };
  // Serialize two paid callbacks so each cleanup observes the other's basket update.
  if (typeof navigator !== 'undefined' && navigator.locks) await navigator.locks.request('tilana-paid-basket-cleanup', clear).catch(() => { /* Keep pending evidence if the browser denies cleanup; payment confirmation still succeeds. */ });
  else clear();
}
