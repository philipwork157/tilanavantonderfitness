import assert from 'node:assert/strict';
import { beforeEach, describe, it, vi } from 'vitest';
import {
  addToBasket,
  BASKET_STORAGE_KEY,
  clearPaidBasket,
  MAX_BASKET_ITEMS,
  PENDING_BASKET_STORAGE_KEY,
  readBasket,
  rememberPendingBasket,
  pendingBasketStorageKey,
  writeBasket,
} from '@web/scripts/basket.ts';

let values: Map<string, string>;

beforeEach(() => {
  values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { dispatchEvent: () => true },
  });
});

describe('public program basket', () => {
  it('keeps valid unique slugs and enforces the ten-item limit', () => {
    const slugs = Array.from({ length: MAX_BASKET_ITEMS + 2 }, (_, index) => `program-${index + 1}`);
    const result = writeBasket([...slugs, slugs[0]!, 'Not a valid slug']);

    assert.deepEqual(result, slugs.slice(0, MAX_BASKET_ITEMS));
    assert.deepEqual(readBasket(), result);
  });

  it('does not duplicate a program added twice', () => {
    addToBasket('beginner-volume-1');
    addToBasket('beginner-volume-1');

    assert.deepEqual(readBasket(), ['beginner-volume-1']);
  });

  it('falls back to an empty basket when browser storage is malformed', () => {
    values.set(BASKET_STORAGE_KEY, '{broken');
    assert.deepEqual(readBasket(), []);
  });

  it('clears only the paid items for the matching checkout reference', async () => {
    writeBasket(['beginner-volume-1', 'strong-volume-1']);
    rememberPendingBasket('TVT-paid-reference', ['beginner-volume-1']);
    addToBasket('nourish-volume-1');

    await clearPaidBasket('TVT-different-reference');
    assert.deepEqual(readBasket(), [
      'beginner-volume-1',
      'strong-volume-1',
      'nourish-volume-1',
    ]);
    assert.notEqual(values.get(pendingBasketStorageKey('TVT-paid-reference')), undefined);

    await clearPaidBasket('TVT-paid-reference');
    assert.deepEqual(readBasket(), ['strong-volume-1', 'nourish-volume-1']);
    assert.equal(values.get(pendingBasketStorageKey('TVT-paid-reference')), undefined);
  });
  it('preserves independent pending references across reload and out-of-order payment completion', async () => {
    writeBasket(['beginner-volume-1', 'strong-volume-1', 'nourish-volume-1']);
    rememberPendingBasket('TVT-first-reference', ['beginner-volume-1']);
    rememberPendingBasket('TVT-second-reference', ['strong-volume-1']);
    // No in-memory state is used: another tab/reloaded module reads the same keys.
    await clearPaidBasket('TVT-second-reference');
    assert.deepEqual(readBasket(), ['beginner-volume-1', 'nourish-volume-1']);
    assert.notEqual(values.get(pendingBasketStorageKey('TVT-first-reference')), undefined);
    await clearPaidBasket('TVT-first-reference');
    assert.deepEqual(readBasket(), ['nourish-volume-1']);
  });
  it('cannot overwrite a reference with a different selection, but accepts harmless reordering', () => {
    rememberPendingBasket('TVT-first-reference', ['beginner-volume-1', 'strong-volume-1']);
    rememberPendingBasket('TVT-first-reference', ['strong-volume-1', 'beginner-volume-1']);
    assert.throws(() => rememberPendingBasket('TVT-first-reference', ['nourish-volume-1']));
    assert.deepEqual(JSON.parse(values.get(pendingBasketStorageKey('TVT-first-reference'))!), ['strong-volume-1', 'beginner-volume-1']);
  });
  it('handles legacy pending records without deleting a different legacy checkout', async () => {
    writeBasket(['beginner-volume-1', 'strong-volume-1']);
    values.set(PENDING_BASKET_STORAGE_KEY, JSON.stringify({ reference: 'TVT-legacy-reference', slugs: ['beginner-volume-1'] }));
    rememberPendingBasket('TVT-new-reference', ['strong-volume-1']);
    await clearPaidBasket('TVT-new-reference');
    assert.notEqual(values.get(PENDING_BASKET_STORAGE_KEY), undefined);
    await clearPaidBasket('TVT-legacy-reference');
    assert.deepEqual(readBasket(), []);
    assert.equal(values.get(PENDING_BASKET_STORAGE_KEY), undefined);
  });
  it('does not clear items from a malformed reference record or an unknown reference', async () => {
    writeBasket(['beginner-volume-1']);
    values.set(pendingBasketStorageKey('TVT-broken-reference'), JSON.stringify(['Not a slug']));
    await clearPaidBasket('TVT-broken-reference');
    await clearPaidBasket('TVT-unknown-reference');
    assert.deepEqual(readBasket(), ['beginner-volume-1']);
  });
  it('still clears a valid new record if the old shared record is corrupted', async () => {
    writeBasket(['beginner-volume-1']);
    rememberPendingBasket('TVT-new-reference', ['beginner-volume-1']);
    values.set(PENDING_BASKET_STORAGE_KEY, '{broken');
    await clearPaidBasket('TVT-new-reference');
    assert.deepEqual(readBasket(), []);
  });
  it('fails closed on invalid references and storage failure before navigation', () => {
    assert.throws(() => rememberPendingBasket('invalid', ['beginner-volume-1']));
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: () => null, setItem: () => { throw new Error('Storage unavailable'); },
    } });
    assert.throws(() => rememberPendingBasket('TVT-new-reference', ['beginner-volume-1']));
  });
  it('serializes simultaneous paid cleanup callbacks through the same Web Lock', async () => {
    const tails = new Map<string, Promise<unknown>>();
    const request = vi.fn((name: string, callback: () => unknown) => {
      const result = (tails.get(name) ?? Promise.resolve()).then(callback);
      tails.set(name, result.catch(() => {}));
      return result;
    });
    vi.stubGlobal('navigator', { locks: { request } });
    writeBasket(['beginner-volume-1', 'strong-volume-1', 'nourish-volume-1']);
    rememberPendingBasket('TVT-first-reference', ['beginner-volume-1']);
    rememberPendingBasket('TVT-second-reference', ['strong-volume-1']);
    await Promise.all([clearPaidBasket('TVT-first-reference'), clearPaidBasket('TVT-second-reference')]);
    assert.deepEqual(readBasket(), ['nourish-volume-1']);
    assert.equal(request.mock.calls.filter(call => call[0] === 'tilana-paid-basket-cleanup').length, 2);
  });
  it('retains cleanup evidence without failing payment confirmation if a Web Lock is denied', async () => {
    vi.stubGlobal('navigator', { locks: { request: (name: string, callback: () => unknown) =>
      name === 'tilana-paid-basket-cleanup' ? Promise.reject(new Error('Lock denied')) : Promise.resolve(callback()),
    } });
    writeBasket(['beginner-volume-1']);
    rememberPendingBasket('TVT-first-reference', ['beginner-volume-1']);
    await clearPaidBasket('TVT-first-reference');
    assert.deepEqual(readBasket(), ['beginner-volume-1']);
    assert.notEqual(values.get(pendingBasketStorageKey('TVT-first-reference')), undefined);
  });
});
