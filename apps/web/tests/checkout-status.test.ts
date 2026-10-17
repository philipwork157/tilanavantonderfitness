import { describe, expect, it } from 'vitest';
import { readCheckoutStatus } from '@web/scripts/checkout-status';

describe('checkout status evidence for browser intent completion', () => {
  it.each(['pending', 'succeeded', 'failed', 'abandoned', 'reversed', 'partially_refunded', 'refunded'])('accepts a contracted %s result', async status => {
    expect(await readCheckoutStatus({ ok: true, json: async () => ({ status, orderNumber: 'WEB-test' }) })).toEqual({ status, orderNumber: 'WEB-test' });
  });

  it.each([null, {}, { status: 'failed' }, { status: 'initialization_uncertain', orderNumber: 'WEB-test' }])('rejects missing or unsupported payment evidence: %j', async body => {
    await expect(readCheckoutStatus({ ok: true, json: async () => body })).rejects.toThrow('could not be confirmed');
  });

  it('rejects HTTP errors even when their bodies look like terminal payment results', async () => {
    await expect(readCheckoutStatus({ ok: false, json: async () => ({ status: 'failed', orderNumber: 'WEB-test' }) })).rejects.toThrow('could not be confirmed');
  });

  it('propagates invalid JSON without treating it as payment evidence', async () => {
    await expect(readCheckoutStatus({ ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } })).rejects.toThrow('Invalid JSON');
  });
});
