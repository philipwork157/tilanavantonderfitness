import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { groupDistinctCatalogueCustomers } from '../server/services/catalogue-reporting-policy.ts';

describe('catalogue customer reporting policy', () => {
  it('counts one customer once per volume and once across a program', () => {
    const result = groupDistinctCatalogueCustomers([
      { volumeId: 11, clientId: 101 },
      { volumeId: 11, clientId: 101 },
      { volumeId: 12, clientId: 101 },
      { volumeId: 12, clientId: 102 },
      { volumeId: 21, clientId: 101 },
    ], new Map([
      [11, 1],
      [12, 1],
      [21, 2],
    ]));

    assert.deepEqual([...result.byVolume.get(11) ?? []], [101]);
    assert.deepEqual([...result.byVolume.get(12) ?? []], [101, 102]);
    assert.deepEqual([...result.byProgram.get(1) ?? []], [101, 102]);
    assert.deepEqual([...result.byProgram.get(2) ?? []], [101]);
  });

  it('ignores detached rows and does not invent a program relationship', () => {
    const result = groupDistinctCatalogueCustomers([
      { volumeId: null, clientId: 101 },
      { volumeId: 99, clientId: 102 },
    ], new Map());

    assert.equal(result.byVolume.has(99), true);
    assert.equal(result.byProgram.size, 0);
  });
});
