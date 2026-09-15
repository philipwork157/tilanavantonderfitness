import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { prepareCheckoutRequest } from '../server/utils/checkout-request.ts';

const security = vi.hoisted(() => ({
  applyContactCors: vi.fn(),
  enforceContactRateLimit: vi.fn(async () => undefined),
  getContactRequestIp: vi.fn(() => '203.0.113.10'),
  verifyContactTurnstile: vi.fn(async () => undefined),
}));

vi.mock('../server/utils/contact-security', () => security);

const event = {} as Parameters<typeof prepareCheckoutRequest>[0];
const schema = {
  safeParse: (value: unknown) => ({ success: true as const, data: value as {
    website: string;
    turnstileToken: string;
    email: string;
  } }),
};

beforeEach(() => {
  vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(input.statusMessage), input));
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('public checkout request boundary', () => {
  it('applies CORS, rate limiting, and Turnstile before accepting checkout', async () => {
    const body = {
      website: '',
      turnstileToken: 'verified-token',
      email: 'customer@example.com',
    };
    vi.stubGlobal('readBody', vi.fn(async () => body));

    assert.equal(await prepareCheckoutRequest(event, schema, 'Invalid checkout.'), body);
    assert.deepEqual(security.applyContactCors.mock.calls, [[event]]);
    assert.deepEqual(security.enforceContactRateLimit.mock.calls, [['203.0.113.10', 'checkout']]);
    assert.deepEqual(security.verifyContactTurnstile.mock.calls, [[
      'verified-token',
      '203.0.113.10',
      'checkout',
    ]]);
  });

  it('rejects the honeypot before spending rate-limit or Turnstile work', async () => {
    vi.stubGlobal('readBody', vi.fn(async () => ({
      website: 'https://spam.example',
      turnstileToken: 'token',
      email: 'bot@example.com',
    })));

    await assert.rejects(
      prepareCheckoutRequest(event, schema, 'Invalid checkout.'),
      { statusCode: 400, statusMessage: 'Checkout could not be started.' },
    );
    assert.equal(security.enforceContactRateLimit.mock.calls.length, 0);
    assert.equal(security.verifyContactTurnstile.mock.calls.length, 0);
  });
});
