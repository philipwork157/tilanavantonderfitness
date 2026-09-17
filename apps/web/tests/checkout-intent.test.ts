import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHECKOUT_INTENTS_STORAGE_KEY, clearCompletedCheckoutIntent, getCheckoutIntentKey, readCheckoutRecoveryReference, rememberCheckoutIntent } from '@web/scripts/checkout-intent';

const request = {
  idempotencyKey: '8b617e23-3095-4610-af55-1179b459581c',
  items: [{ volumeSlug: 'strong-volume-1', expectedPriceCents: 10000 }],
  firstName: 'Test', lastName: 'Customer', email: 'customer@example.test', phone: '',
  consent: true as const, website: '', turnstileToken: '',
};
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  let queue = Promise.resolve();
  vi.stubGlobal('navigator', { locks: { request: (_name: string, action: () => unknown) => {
    const result = queue.then(action);
    queue = result.then(() => undefined, () => undefined);
    return result;
  } } });
});

describe('persistent browser checkout intent', () => {
  it('recovers a reserved reference from an API error without accepting arbitrary URLs', () => {
    expect(readCheckoutRecoveryReference({ data: { reference: 'TVT-reserved-reference' } })).toBe('TVT-reserved-reference');
    for (const body of [null, {}, { data: null }, { data: { reference: 'https://evil.test/' } }, { data: { reference: 123 } }]) {
      expect(readCheckoutRecoveryReference(body)).toBeNull();
    }
  });
  it('reuses the key for retries, token refresh, and simultaneous tabs', async () => {
    const [first, second] = await Promise.all([getCheckoutIntentKey(request), getCheckoutIntentKey({ ...request, turnstileToken: 'new-token' })]);
    expect(second).toBe(first);
    expect(await getCheckoutIntentKey({ ...request, email: 'CUSTOMER@EXAMPLE.TEST' })).toBe(first);
    expect(values.get(CHECKOUT_INTENTS_STORAGE_KEY)).not.toContain('customer@example.test');
  });

  it('creates a separate intent when the basket or customer changes', async () => {
    const first = await getCheckoutIntentKey(request);
    expect(await getCheckoutIntentKey({ ...request, email: 'other@example.test' })).not.toBe(first);
    expect(await getCheckoutIntentKey({ ...request, items: [{ volumeSlug: 'move-volume-1', expectedPriceCents: 10000 }] })).not.toBe(first);
  });

  it('retires only the confirmed paid intent and allows a deliberate later purchase', async () => {
    const first = await getCheckoutIntentKey(request);
    await rememberCheckoutIntent(first, 'TVT-paid');
    await clearCompletedCheckoutIntent('TVT-other');
    expect(await getCheckoutIntentKey(request)).toBe(first);
    await clearCompletedCheckoutIntent('TVT-paid');
    expect(await getCheckoutIntentKey(request)).not.toBe(first);
  });

  it('fails closed when storage cannot safely persist the key', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('Storage blocked'); } });
    await expect(getCheckoutIntentKey(request)).rejects.toThrow('Storage blocked');
  });

  it.each(['{broken', '[]', '{"wrong-hash":{"key":"wrong"}}'])('does not silently replace malformed intent storage: %s', raw => {
    values.set(CHECKOUT_INTENTS_STORAGE_KEY, raw);
    return expect(getCheckoutIntentKey(request)).rejects.toThrow();
  });

  it('works synchronously within one tab when Web Locks are unavailable', async () => {
    vi.stubGlobal('navigator', {});
    expect(await getCheckoutIntentKey(request)).toBe(await getCheckoutIntentKey(request));
  });
});
