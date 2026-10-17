import { checkoutIntentKeySchema, serializeCheckoutIntent, type BasketCheckoutRequest } from '@tilana/contracts/checkout';

export const CHECKOUT_INTENTS_STORAGE_KEY = 'tilana-checkout-intents';
type Intent = { key: string; reference?: string };
type IntentMap = Record<string, Intent>;

/** Recover only a validated payment reference from a failed API response. */
export function readCheckoutRecoveryReference(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('data' in body)
    || !body.data || typeof body.data !== 'object' || !('reference' in body.data)) return null;
  const reference = body.data.reference;
  return typeof reference === 'string' && /^[A-Za-z0-9.=-]{10,160}$/.test(reference) ? reference : null;
}

/** All storage mutations share the same lock, including completion in another tab. */
async function withIntentLock<T>(action: () => T): Promise<T> {
  return typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request('tilana-checkout-intents', action) : action();
}

/** Corrupted or unavailable persistence must not silently create another payment intent. */
function readIntents(): IntentMap {
  const raw: unknown = JSON.parse(localStorage.getItem(CHECKOUT_INTENTS_STORAGE_KEY) ?? '{}');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Checkout storage needs review. Please contact us before retrying payment.');
  for (const [hash, entry] of Object.entries(raw)) {
    if (!/^[a-f0-9]{64}$/.test(hash) || !entry || typeof entry !== 'object'
      || !checkoutIntentKeySchema.safeParse(entry.key).success
      || (entry.reference !== undefined && typeof entry.reference !== 'string')) {
      throw new Error('Checkout storage needs review. Please contact us before retrying payment.');
    }
  }
  return raw as IntentMap;
}

/** Reuse purchase intent across retries/reloads/tabs without persisting customer details. */
export async function getCheckoutIntentKey(input: BasketCheckoutRequest): Promise<string> {
  const bytes = new TextEncoder().encode(serializeCheckoutIntent(input));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  const reserve = () => {
    const intents = readIntents();
    if (intents[hash]) return intents[hash].key;
    if (Object.keys(intents).length >= 100) throw new Error('Please contact us to review your pending checkouts before starting another.');
    const key = crypto.randomUUID();
    intents[hash] = { key };
    localStorage.setItem(CHECKOUT_INTENTS_STORAGE_KEY, JSON.stringify(intents));
    return key;
  };
  // Web Locks serialize first creation across tabs in modern secure-context browsers.
  return withIntentLock(reserve);
}

/** Associate successful initialization with its intent so paid completion can retire it. */
export async function rememberCheckoutIntent(key: string, reference: string): Promise<void> {
  await withIntentLock(() => {
    const intents = readIntents();
    const entry = Object.values(intents).find(intent => intent.key === key);
    if (entry) {
      entry.reference = reference;
      localStorage.setItem(CHECKOUT_INTENTS_STORAGE_KEY, JSON.stringify(intents));
    }
  });
}

/** Surface retirement failures so the status UI cannot offer a misleading fresh-payment retry. */
export async function clearCompletedCheckoutIntent(reference: string): Promise<void> {
  await withIntentLock(() => {
    const intents = readIntents();
    for (const [hash, intent] of Object.entries(intents)) {
      if (intent.reference === reference) delete intents[hash];
    }
    localStorage.setItem(CHECKOUT_INTENTS_STORAGE_KEY, JSON.stringify(intents));
  });
}
