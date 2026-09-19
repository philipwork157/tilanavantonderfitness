import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  getTerminalCheckoutResolution,
  isPaymentAlreadyFulfilled,
  isPaystackEnvironmentMatch,
} from '@server/services/paystack-policy.ts';

describe('Paystack lifecycle policy', () => {
  it('requires the provider environment to be present and match exactly', () => {
    assert.equal(isPaystackEnvironmentMatch('test', 'test'), true);
    assert.equal(isPaystackEnvironmentMatch('live', 'live'), true);
    assert.equal(isPaystackEnvironmentMatch('test', 'live'), false);
    assert.equal(isPaystackEnvironmentMatch(null, 'test'), false);
    assert.equal(isPaystackEnvironmentMatch('test', null), false);
  });

  it('protects fulfilled and refunded payments from replayed success events', () => {
    for (const status of ['succeeded', 'partially_refunded', 'refunded', 'reversed']) {
      assert.equal(isPaymentAlreadyFulfilled(status), true, status);
    }
    for (const status of ['pending', 'failed', 'abandoned']) {
      assert.equal(isPaymentAlreadyFulfilled(status), false, status);
    }
  });

  it('maps terminal verification states to the matching order action', () => {
    assert.deepEqual(getTerminalCheckoutResolution('failed'), {
      paymentStatus: 'failed',
      orderStatus: 'cancelled',
      fullyRefunded: false,
      revokeAccess: false,
    });
    assert.deepEqual(getTerminalCheckoutResolution('abandoned'), {
      paymentStatus: 'abandoned',
      orderStatus: 'cancelled',
      fullyRefunded: false,
      revokeAccess: false,
    });
    assert.deepEqual(getTerminalCheckoutResolution('reversed'), {
      paymentStatus: 'reversed',
      orderStatus: 'refunded',
      fullyRefunded: true,
      revokeAccess: true,
    });
    assert.equal(getTerminalCheckoutResolution('ongoing'), null);
    assert.equal(getTerminalCheckoutResolution(null), null);
  });
});
