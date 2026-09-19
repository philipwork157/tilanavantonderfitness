import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ enforceSameOrigin: vi.fn(), enforceLoginRateLimit: vi.fn(), claimLoginRecipient: vi.fn(), getDatabase: vi.fn(),
  assertPaystackDatabaseEnvironment: vi.fn(), queueCustomerLogin: vi.fn(), deliverCustomerNotifications: vi.fn() }));
vi.mock('@server/utils/auth-security', () => mocks);
vi.mock('@server/utils/database', () => mocks);
vi.mock('@server/services/customer-notifications', () => mocks);
vi.mock('@server/utils/paystack-configuration', () => ({ ...mocks, getCustomerAccountBaseUrl: () => 'https://admin.example.test' }));
let body: unknown;
vi.mock('@server/utils/route-validation', () => ({ readZodBody: async (_event: unknown, schema: { parse: (value: unknown) => unknown }) => schema.parse(body) }));
let handler: (event: never) => Promise<unknown>;
let buyers: unknown[];
beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (value: unknown) => value);
  handler = (await import('@server/api/customer/auth/magic-link.post')).default;
});
beforeEach(() => {
  body = { email: 'buyer@example.test' };
  buyers = [{ id: 7, firstName: 'Buyer' }];
  mocks.getDatabase.mockReturnValue({ select: () => ({ from: () => ({ innerJoin: () => ({ where: () => ({ limit: async () => buyers }) }) }) }) });
  mocks.queueCustomerLogin.mockResolvedValue(12);
  mocks.claimLoginRecipient.mockResolvedValue(true);
  mocks.deliverCustomerNotifications.mockResolvedValue({ failed: 0 });
  vi.stubGlobal('useRuntimeConfig', () => ({}));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
describe('private customer login queue route', () => {
  it('queues an eligible customer and attempts immediate delivery', async () => {
    expect(await handler({} as never)).toEqual({ ok: true });
    expect(mocks.queueCustomerLogin).toHaveBeenCalledWith(7);
    expect(mocks.deliverCustomerNotifications).toHaveBeenCalledWith(12);
  });
  it('returns the same generic response for an unknown email', async () => {
    buyers = [];
    expect(await handler({} as never)).toEqual({ ok: true });
    expect(mocks.queueCustomerLogin).not.toHaveBeenCalled();
  });
  it('silently suppresses repeated delivery to the same recipient', async () => {
    mocks.claimLoginRecipient.mockResolvedValueOnce(false);
    expect(await handler({} as never)).toEqual({ ok: true });
    expect(mocks.queueCustomerLogin).not.toHaveBeenCalled();
  });
  it('does not leak queue failures or token-bearing provider errors', async () => {
    mocks.queueCustomerLogin.mockRejectedValueOnce(new Error('secret-token'));
    expect(await handler({} as never)).toEqual({ ok: true });
    expect(console.error).toHaveBeenCalledWith('Customer magic-link queue or delivery requires attention.');
  });
  it.each(['enforceSameOrigin', 'enforceLoginRateLimit', 'assertPaystackDatabaseEnvironment'] as const)('enforces %s before queuing', async key => {
    if (key === 'assertPaystackDatabaseEnvironment') mocks[key].mockRejectedValueOnce(new Error('Denied'));
    else mocks[key].mockImplementationOnce(() => { throw new Error('Denied'); });
    await expect(handler({} as never)).rejects.toThrow('Denied');
    expect(mocks.queueCustomerLogin).not.toHaveBeenCalled();
  });
  it('rejects invalid email input before work', async () => {
    body = { email: 'invalid' };
    await expect(handler({} as never)).rejects.toThrow();
    expect(mocks.queueCustomerLogin).not.toHaveBeenCalled();
  });
});
