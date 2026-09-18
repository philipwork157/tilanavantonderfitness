import { describe, expect, it, vi } from 'vitest';
import type { CheckoutStatusResponse } from '@tilana/contracts/checkout';
import { checkoutStatusMessage, confirmCheckoutStatus } from '@web/scripts/checkout-completion';

const reference = 'WEB-payment-123';
const response = (status: CheckoutStatusResponse['status']) => new Response(JSON.stringify({ status, orderNumber: 'WEB-123' }));
const setup = () => ({ fetch: vi.fn<typeof fetch>(), pause: vi.fn(async () => {}), clearPaid: vi.fn(async () => {}), retireIntent: vi.fn(async () => {}) });

describe('verified checkout completion', () => {
  it.each([
    ['succeeded', 'Payment received', true],
    ['partially_refunded', 'Payment partially refunded', true],
    ['refunded', 'Payment refunded', false],
    ['reversed', 'Payment reversed', false],
    ['failed', 'Payment not completed', false],
    ['abandoned', 'Checkout not completed', false],
    ['pending', 'Payment is still processing', false],
  ] as const)('presents %s explicitly with correct access guidance', (status, heading, access) => {
    expect(checkoutStatusMessage({ status, orderNumber: 'WEB-123' })).toMatchObject({ heading, access });
  });

  it.each(['succeeded', 'partially_refunded', 'refunded', 'reversed', 'failed', 'abandoned'] as const)('handles a revisited %s callback without guessing entitlement', async status => {
    const dependencies = setup();
    dependencies.fetch.mockResolvedValue(response(status));
    const result = await confirmCheckoutStatus('https://admin.example/api/checkout/status', reference, dependencies);
    expect(result).toEqual(checkoutStatusMessage({ status, orderNumber: 'WEB-123' }));
    const paid = status === 'succeeded' || status === 'partially_refunded';
    expect(dependencies.clearPaid).toHaveBeenCalledTimes(paid ? 1 : 0);
    expect(dependencies.retireIntent).toHaveBeenCalledTimes(paid ? 0 : 1);
    expect(paid ? dependencies.clearPaid : dependencies.retireIntent).toHaveBeenCalledWith(reference);
    expect(dependencies.pause).not.toHaveBeenCalled();
    const [url, options] = dependencies.fetch.mock.calls[0]!;
    expect(new URL(String(url)).searchParams.get('reference')).toBe(reference);
    expect(options).toMatchObject({ cache: 'no-store', signal: expect.any(AbortSignal) });
  });

  it('waits through delayed confirmation and invalid evidence before clearing a paid basket', async () => {
    const dependencies = setup();
    dependencies.fetch.mockResolvedValueOnce(response('pending'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'failed', orderNumber: 'WEB-123' }), { status: 503 }))
      .mockResolvedValueOnce(new Response('{}'))
      .mockRejectedValueOnce(new Error('Network failure'))
      .mockResolvedValueOnce(response('succeeded'));
    expect(await confirmCheckoutStatus('https://admin.example/status', reference, dependencies)).toMatchObject({ heading: 'Payment received' });
    expect(dependencies.pause).toHaveBeenCalledTimes(4);
    expect(dependencies.clearPaid).toHaveBeenCalledExactlyOnceWith(reference);
    expect(dependencies.retireIntent).not.toHaveBeenCalled();
  });

  it.each(['pending', 'unavailable', 'invalid-json'] as const)('bounds %s polling without retiring uncertain payment evidence', async mode => {
    const dependencies = setup();
    dependencies.fetch.mockImplementation(async () => mode === 'pending' ? response('pending') : new Response(mode === 'invalid-json' ? 'not JSON' : '{}', { status: mode === 'unavailable' ? 503 : 200 }));
    expect(await confirmCheckoutStatus('https://admin.example/status', reference, dependencies)).toMatchObject({ heading: 'Payment is still processing', access: false });
    expect(dependencies.fetch).toHaveBeenCalledTimes(10);
    expect(dependencies.pause).toHaveBeenCalledTimes(9);
    expect(dependencies.clearPaid).not.toHaveBeenCalled();
    expect(dependencies.retireIntent).not.toHaveBeenCalled();
  });
});
