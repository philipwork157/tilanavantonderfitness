import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertCustomerDeliveryConfigured, isLocalCustomerWorkerEnabled } from '@server/utils/customer-delivery-configuration';
const mocks = vi.hoisted(() => ({ checkConfiguration: vi.fn(), send: vi.fn() }));
vi.mock('@server/utils/email', () => ({ getServerEmail: () => ({ sender: mocks }) }));
const config = { customerNotificationsEnabled: true, localCustomerNotificationsWorkerEnabled: true,
  paystackEnvironment: 'test', emailDevelopmentEnabled: true, emailDevelopmentRecipient: 'safe@example.test' };
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'development'); vi.stubEnv('FLY_APP_NAME', '');
  vi.stubGlobal('useRuntimeConfig', () => config);
  vi.stubGlobal('createError', (input: object) => Object.assign(new Error('Delivery not ready'), input));
  mocks.checkConfiguration.mockResolvedValue(undefined);
});
describe('checkout delivery configuration gate', () => {
  it('checks credentials without sending email', async () => {
    await expect(assertCustomerDeliveryConfigured('buyer@example.test')).resolves.toBeUndefined();
    expect(mocks.checkConfiguration).toHaveBeenCalledOnce(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each([
    { customerNotificationsEnabled: false }, { localCustomerNotificationsWorkerEnabled: false },
    { emailDevelopmentEnabled: false }, { emailDevelopmentRecipient: '' },
    { paystackEnvironment: 'live' },
  ])('blocks unsafe or disabled settings: %j', async change => {
    vi.stubGlobal('useRuntimeConfig', () => ({ ...config, ...change }));
    await expect(assertCustomerDeliveryConfigured('buyer@example.test')).rejects.toMatchObject({ statusCode: 503 });
    expect(mocks.checkConfiguration).not.toHaveBeenCalled();
  });
  it.each(['production', 'test'])('does not activate the local worker in %s', env => {
    vi.stubEnv('NODE_ENV', env); expect(isLocalCustomerWorkerEnabled()).toBe(false);
  });
  it('requires a protected deployed scheduler, even with the local flag set', async () => {
    vi.stubEnv('FLY_APP_NAME', 'tilana-dev');
    expect(isLocalCustomerWorkerEnabled()).toBe(false);
    await expect(assertCustomerDeliveryConfigured('buyer@example.test')).rejects.toMatchObject({ statusCode: 503 });
    vi.stubGlobal('useRuntimeConfig', () => ({ ...config, paystackRecoveryEnabled: true,
      paystackRecoveryToken: 'fixture-'.repeat(5), paystackRecoveryAlertTo: 'owner@example.test' }));
    await expect(assertCustomerDeliveryConfigured('buyer@example.test')).resolves.toBeUndefined();
  });
  it('fails closed when the credential chain cannot resolve', async () => {
    mocks.checkConfiguration.mockRejectedValue(new Error('Provider credentials missing'));
    await expect(assertCustomerDeliveryConfigured('buyer@example.test')).rejects.toMatchObject({ statusCode: 503 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('bounds a stalled credential provider', async () => {
    vi.useFakeTimers();
    try {
      mocks.checkConfiguration.mockImplementation(() => new Promise(() => {}));
      const result = expect(assertCustomerDeliveryConfigured('buyer@example.test')).rejects.toMatchObject({ statusCode: 503 });
      await vi.advanceTimersByTimeAsync(5001); await result;
    } finally { vi.useRealTimers(); }
  });
});
