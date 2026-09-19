import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyContactCors: vi.fn(),
  claimSharedAllowance: vi.fn(),
  enforceSharedLimit: vi.fn(),
  getPaystackCheckoutStatus: vi.fn(),
  getTrustedRequestIp: vi.fn(),
  verifyPaystackCheckout: vi.fn(),
}));
vi.mock('@server/services/paystack', () => mocks);
vi.mock('@server/services/abuse-controls', () => ({
  ...mocks,
  abusePolicies: { statusIp: { namespace: 'status' }, verificationReference: { namespace: 'verify' } },
}));
vi.mock('@server/utils/contact-security', () => mocks);
vi.mock('@server/utils/request-identity', () => mocks);

let handler: (event: never) => Promise<unknown>;
beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (value: unknown) => value);
  handler = (await import('@server/api/checkout/status.get')).default;
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('getQuery', () => ({ reference: 'TVT-valid-reference' }));
  vi.stubGlobal('createError', (input: object) => Object.assign(new Error('request failed'), input));
  mocks.getTrustedRequestIp.mockReturnValue('203.0.113.10');
  mocks.claimSharedAllowance.mockResolvedValue(true);
  mocks.getPaystackCheckoutStatus.mockResolvedValue({ status: 'pending', orderNumber: 'TVT-1' });
});

describe('public checkout status abuse boundary', () => {
  it('rate limits the trusted ingress identity before reading payment state', async () => {
    mocks.enforceSharedLimit.mockRejectedValueOnce(Object.assign(new Error('limited'), { statusCode: 429 }));
    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 429 });
    expect(mocks.getPaystackCheckoutStatus).not.toHaveBeenCalled();
  });

  it('suppresses provider verification when another instance owns the reference cooldown', async () => {
    mocks.claimSharedAllowance.mockResolvedValueOnce(false);
    await expect(handler({} as never)).resolves.toMatchObject({ status: 'pending' });
    expect(mocks.verifyPaystackCheckout).not.toHaveBeenCalled();
  });

  it('refreshes status after winning the shared verification claim', async () => {
    mocks.getPaystackCheckoutStatus
      .mockResolvedValueOnce({ status: 'pending', orderNumber: 'TVT-1' })
      .mockResolvedValueOnce({ status: 'succeeded', orderNumber: 'TVT-1' });
    await expect(handler({} as never)).resolves.toMatchObject({ status: 'succeeded' });
    expect(mocks.verifyPaystackCheckout).toHaveBeenCalledWith('TVT-valid-reference');
  });
});
