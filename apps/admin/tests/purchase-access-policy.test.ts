import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { shouldGrantManualProgramAccess } from '../server/services/client-access-policy.ts';

describe('manual purchase access policy', () => {
  it('grants access only after the manual order is marked paid', () => {
    assert.equal(shouldGrantManualProgramAccess('paid'), true);
    assert.equal(shouldGrantManualProgramAccess('pending'), false);
  });
});
