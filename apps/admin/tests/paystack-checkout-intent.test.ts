import { describe, expect, it } from 'vitest';
import { basketCheckoutRequestSchema, checkoutRequestSchema, serializeCheckoutIntent } from '@tilana/contracts/checkout';
import { paystackInitializationResponseSchema } from '@tilana/contracts/payments';
import { hashCheckoutIntent } from '@server/services/paystack-checkout-intent';

const request = {
  idempotencyKey: '8b617e23-3095-4610-af55-1179b459581c',
  items: [{ volumeSlug: 'strong-volume-1', expectedPriceCents: 10000 }, { volumeSlug: 'move-volume-1', expectedPriceCents: 20000 }],
  firstName: 'Test', lastName: 'Customer', email: 'customer@example.test', phone: '',
  consent: true as const, website: '', turnstileToken: '',
};

describe('checkout intent contracts and identity', () => {
  it.each([undefined, '', 'predictable-key', '1'.repeat(500)])('rejects an invalid intent key: %s', key => {
    expect(basketCheckoutRequestSchema.safeParse({ ...request, idempotencyKey: key }).success).toBe(false);
    expect(checkoutRequestSchema.safeParse({ ...request, volumeSlug: 'strong-volume-1', expectedPriceCents: 10000, idempotencyKey: key }).success).toBe(false);
  });

  it('normalizes email/item order while excluding rotating security tokens', () => {
    const equivalent = { ...request, email: ' CUSTOMER@EXAMPLE.TEST ', items: [...request.items].reverse(), turnstileToken: 'new-token' };
    expect(serializeCheckoutIntent(equivalent)).toBe(serializeCheckoutIntent(request));
    expect(hashCheckoutIntent(equivalent)).toEqual(hashCheckoutIntent(request));
    expect(hashCheckoutIntent(request).keyHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    { email: 'another@example.test' }, { firstName: 'Another' }, { phone: '123' },
    { items: [{ volumeSlug: 'strong-volume-1', expectedPriceCents: 10001 }] },
  ])('binds an intent to changed purchase details: %j', change => {
    expect(hashCheckoutIntent({ ...request, ...change }).requestHash).not.toBe(hashCheckoutIntent(request).requestHash);
  });

  it.each(['http://checkout.paystack.com/test', 'https://evil.test/pay', 'https://checkout.paystack.com.evil.test/test', 'https://user@checkout.paystack.com/test', 'javascript:alert(1)'])('rejects an unsafe checkout URL: %s', url => {
    expect(paystackInitializationResponseSchema.safeParse({ status: true, data: { reference: 'TVT-test', access_code: 'code', authorization_url: url } }).success).toBe(false);
  });

  it('accepts only complete successful initialization evidence', () => {
    const response = { status: true, data: { reference: 'TVT-test', access_code: 'code', authorization_url: 'https://checkout.paystack.com/test' } };
    expect(paystackInitializationResponseSchema.safeParse(response).success).toBe(true);
    expect(paystackInitializationResponseSchema.safeParse({ ...response, status: false }).success).toBe(false);
    expect(paystackInitializationResponseSchema.safeParse({ ...response, data: { ...response.data, access_code: undefined } }).success).toBe(false);
  });
});
