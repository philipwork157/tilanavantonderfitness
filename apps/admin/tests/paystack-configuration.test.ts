import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCustomerAccountBaseUrl, getPaystackCheckoutConfiguration, getPaystackCredentials, validatePaymentUrl } from '@server/utils/paystack-configuration';

const config = {
  paystackEnvironment: 'test', paystackSecretKey: 'sk_test_fixture',
  paystackCallbackUrl: 'https://website.example.test/checkout/complete',
  accountBaseUrl: 'https://admin.example.test', public: { siteUrl: 'https://website.example.test' },
};
beforeEach(() => {
  vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) => Object.assign(new Error(input.statusMessage), input));
  vi.stubGlobal('useRuntimeConfig', () => config);
});

describe('Paystack deployment configuration', () => {
  it.each([
    ['tilanavantonder-admin-prod', 'test'], ['tilanavantonder-admin-dev', 'live'],
  ])('rejects mode %s on the wrong Fly deployment', (app, environment) => {
    vi.stubEnv('FLY_APP_NAME', app);
    vi.stubGlobal('useRuntimeConfig', () => ({ ...config, paystackEnvironment: environment, paystackSecretKey: `sk_${environment}_fixture` }));
    expect(() => getPaystackCredentials()).toThrow();
  });
  it.each([
    ['test', 'sk_live_fixture'], ['live', 'sk_test_fixture'], ['other', 'sk_test_fixture'],
    ['test', 'pk_test_fixture'], ['test', ''], ['test', 'sk_test_'],
  ])('rejects mode %s and mismatched or missing secret before checkout', (environment, key) => {
    vi.stubGlobal('useRuntimeConfig', () => ({ ...config, paystackEnvironment: environment, paystackSecretKey: key }));
    expect(() => getPaystackCheckoutConfiguration()).toThrow();
  });
  it.each(['test', 'live'])('accepts matching %s credentials', (environment) => {
    vi.stubGlobal('useRuntimeConfig', () => ({ ...config, paystackEnvironment: environment, paystackSecretKey: `sk_${environment}_fixture` }));
    expect(getPaystackCredentials().environment).toBe(environment);
  });
  it.each([
    'http://website.example.test/checkout/complete',
    'https://website.example.test/wrong', 'https://name:secret@website.example.test/checkout/complete',
    'https://website.example.test/checkout/complete?next=https://evil.test',
    'https://website.example.test/checkout/complete#fragment', 'not-a-url',
  ])('rejects unsafe callback %s', (callback) => {
    vi.stubGlobal('useRuntimeConfig', () => ({ ...config, public: { siteUrl: callback } }));
    expect(() => getPaystackCheckoutConfiguration()).toThrow();
  });
  it('rejects localhost defaults in deployed builds, including test mode', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => validatePaymentUrl('http://127.0.0.1:4321', 'test')).toThrow();
    expect(() => validatePaymentUrl('https://localhost', 'test')).toThrow();
  });
  it('allows local test development but not local live payments', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(validatePaymentUrl('http://127.0.0.1:4321', 'test').origin).toBe('http://127.0.0.1:4321');
    expect(() => validatePaymentUrl('http://127.0.0.1:4321', 'live')).toThrow();
  });
  it('derives the callback from the validated public origin', () => {
    expect(getPaystackCheckoutConfiguration().callbackUrl).toBe('https://website.example.test/checkout/complete');
  });
  it('keeps localhost test checkout and account URLs on the same local hostname', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubGlobal('useRuntimeConfig', () => ({ ...config,
      accountBaseUrl: 'http://localhost:3001', public: { siteUrl: 'http://localhost:4321' },
    }));
    const local = getPaystackCheckoutConfiguration();
    expect(local.callbackUrl).toBe('http://localhost:4321/checkout/complete');
    expect(getCustomerAccountBaseUrl()).toBe('http://localhost:3001');
  });
  it('validates the account URL as well as the website callback', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubGlobal('useRuntimeConfig', () => ({ ...config, accountBaseUrl: 'http://127.0.0.1:3001' }));
    expect(() => getPaystackCheckoutConfiguration()).toThrow();
  });
});
