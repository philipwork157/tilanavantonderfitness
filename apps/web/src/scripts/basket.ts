import { catalogueSlugSchema } from '@tilana/contracts/catalogue';

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
  try {
    localStorage.setItem(PENDING_BASKET_STORAGE_KEY, JSON.stringify({ reference, slugs: validSlugs(slugs) }));
  } catch {
    // Payment is not dependent on browser storage.
  }
}

export function clearPaidBasket(reference: string): void {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_BASKET_STORAGE_KEY) ?? 'null') as unknown;
    if (!value || typeof value !== 'object') return;
    const pending = value as Partial<PendingBasket>;
    if (pending.reference !== reference) return;
    const paidSlugs = new Set(validSlugs(pending.slugs));
    writeBasket(readBasket().filter(slug => !paidSlugs.has(slug)));
    localStorage.removeItem(PENDING_BASKET_STORAGE_KEY);
  } catch {
    // A malformed local value must not affect the payment confirmation screen.
  }
}
