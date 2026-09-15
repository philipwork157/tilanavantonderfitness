import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'vitest';
import {
  addToBasket,
  BASKET_STORAGE_KEY,
  clearPaidBasket,
  MAX_BASKET_ITEMS,
  PENDING_BASKET_STORAGE_KEY,
  readBasket,
  rememberPendingBasket,
  writeBasket,
} from '../src/scripts/basket.ts';

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

  it('clears only the paid items for the matching checkout reference', () => {
    writeBasket(['beginner-volume-1', 'strong-volume-1']);
    rememberPendingBasket('TVT-paid-reference', ['beginner-volume-1']);
    addToBasket('nourish-volume-1');

    clearPaidBasket('TVT-different-reference');
    assert.deepEqual(readBasket(), [
      'beginner-volume-1',
      'strong-volume-1',
      'nourish-volume-1',
    ]);
    assert.notEqual(values.get(PENDING_BASKET_STORAGE_KEY), undefined);

    clearPaidBasket('TVT-paid-reference');
    assert.deepEqual(readBasket(), ['strong-volume-1', 'nourish-volume-1']);
    assert.equal(values.get(PENDING_BASKET_STORAGE_KEY), undefined);
  });
});
