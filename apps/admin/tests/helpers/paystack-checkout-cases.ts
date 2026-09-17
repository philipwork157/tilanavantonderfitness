import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Database } from '@tilana/db/server';
import type { BasketCheckoutRequest } from '@tilana/contracts/checkout';
import { orderItems, orders, payments, programAccess, programFiles, programs, programVolumes } from '@tilana/db/schema';
import { and, eq } from 'drizzle-orm';
import { initializePaystackBasketCheckout, initializePaystackCheckout, processPaystackEvent } from '@server/services/paystack';
import { hashCheckoutIntent } from '@server/services/paystack-checkout-intent';
import { createBarrier } from './paystack-database';

/** Register database cases in the single integration entry point sharing its fresh cluster. */
export function registerCheckoutCases(getDatabase: () => Database) {
  const config = {
    paystackSecretKey: 'sk_test_integration_fixture', paystackEnvironment: 'test',
    paystackCallbackUrl: 'https://website.example.test/checkout/complete',
    r2PublicMediaBucket: 'test-public', r2PublicMediaBaseUrl: 'https://media.example.test',
    r2PrivateProgramBucket: 'test-private',
  };

  /** Seed real published products with ready private files, not mocked catalogue data. */
  async function basket(): Promise<BasketCheckoutRequest> {
    const suffix = randomUUID();
    const db = getDatabase();
    const [program] = await db.insert(programs).values({ slug: `checkout-${suffix}`, name: 'Checkout program', status: 'published' }).returning();
    if (!program) throw new Error('Test program could not be seeded.');
    const volumes = await db.insert(programVolumes).values([1, 2].map(number => ({
      programId: program.id, slug: `checkout-${suffix}-volume-${number}`, name: `Volume ${number}`,
      volumeNumber: number, currentPriceCents: number * 10000, isPublished: true,
    }))).returning();
    await db.insert(programFiles).values(volumes.map(volume => ({
      programVolumeId: volume.id, displayName: 'Program PDF', r2Bucket: 'test-private',
      r2ObjectKey: `test/${volume.id}.pdf`, uploadStatus: 'ready' as const,
    })));
    return {
      idempotencyKey: randomUUID(), items: volumes.map(volume => ({ volumeSlug: volume.slug!, expectedPriceCents: volume.currentPriceCents })),
      firstName: 'Test', lastName: 'Customer', email: `${suffix}@example.test`, phone: '',
      consent: true, website: '', turnstileToken: '',
    };
  }

  async function attempts(input: BasketCheckoutRequest) {
    return getDatabase().select().from(payments).where(eq(payments.checkoutIntentKeyHash, hashCheckoutIntent(input).keyHash));
  }

  function successfulInitialize() {
    return vi.fn().mockImplementation((_url: string, options: { body: { reference: string } }) => ({
      status: true, data: { reference: options.body.reference, access_code: 'test-code', authorization_url: 'https://checkout.paystack.com/test-code' },
    }));
  }

  async function charge(reference: string, amount = 30000) {
    await processPaystackEvent({ event: 'charge.success', data: {
      id: `charge-${reference}`, reference, amount, currency: 'ZAR', domain: 'test', status: 'success',
    } }, `success-${reference}`);
  }

  describe('durable checkout intent against PostgreSQL', () => {
    beforeEach(() => vi.stubGlobal('useRuntimeConfig', () => config));

    it('serializes simultaneous submissions into one order, payment, and provider call', async () => {
      const input = await basket();
      const fetch = successfulInitialize();
      vi.stubGlobal('$fetch', fetch);
      const results = await Promise.all(Array.from({ length: 8 }, () => initializePaystackBasketCheckout(input)));
      expect(new Set(results.map(result => result.reference)).size).toBe(1);
      expect(results.every(result => result.authorizationUrl === results[0]?.authorizationUrl)).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);
      const stored = await attempts(input);
      expect(stored).toHaveLength(1);
      const items = await getDatabase().select().from(orderItems).where(eq(orderItems.orderId, stored[0]!.orderId));
      expect(items).toHaveLength(2);
      expect(items.reduce((sum, item) => sum + item.lineTotalCents, 0)).toBe(30000);
      expect(fetch.mock.calls[0]?.[1]).toMatchObject({ timeout: 10000, retry: 0, body: { amount: '30000', reference: results[0]?.reference } });
    });

    it('reuses the saved URL after a lost browser response and token refresh', async () => {
      const input = await basket();
      const fetch = successfulInitialize();
      vi.stubGlobal('$fetch', fetch);
      const first = await initializePaystackBasketCheckout(input);
      expect(await initializePaystackBasketCheckout({ ...input, items: [...input.items].reverse(), email: input.email.toUpperCase(), turnstileToken: 'new-token' })).toEqual(first);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(await attempts(input)).toHaveLength(1);
    });

    it('lets a duplicate wait for the original provider result without another initialization', async () => {
      const input = await basket();
      const started = createBarrier();
      const release = createBarrier();
      const fetch = vi.fn().mockImplementation(async (_url: string, options: { body: { reference: string } }) => {
        started.resolve();
        await release.promise;
        return { status: true, data: { reference: options.body.reference, access_code: 'code', authorization_url: 'https://checkout.paystack.com/code' } };
      });
      vi.stubGlobal('$fetch', fetch);
      const original = initializePaystackBasketCheckout(input);
      await started.promise;
      const duplicate = initializePaystackBasketCheckout(input);
      try {
        expect((await attempts(input))[0]?.providerStatus).toBe('initializing');
        expect(fetch).toHaveBeenCalledTimes(1);
      } finally { release.resolve(); }
      const [first, second] = await Promise.all([original, duplicate]);
      expect(second).toEqual(first);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it.each(['email', 'items', 'phone'])('rejects %s changes under an existing key', async field => {
      const input = await basket();
      vi.stubGlobal('$fetch', successfulInitialize());
      await initializePaystackBasketCheckout(input);
      const changed = { ...input, ...(field === 'email' ? { email: 'other@example.test' }
        : field === 'phone' ? { phone: '123' } : { items: input.items.slice(0, 1) }) };
      await expect(initializePaystackBasketCheckout(changed)).rejects.toMatchObject({ statusCode: 409 });
      expect(await attempts(input)).toHaveLength(1);
    });

    it('preserves immutable purchase prices when the catalogue changes after reservation', async () => {
      const input = await basket();
      vi.stubGlobal('$fetch', successfulInitialize());
      const first = await initializePaystackBasketCheckout(input);
      await getDatabase().update(programVolumes).set({ currentPriceCents: 99999, isPublished: false }).where(eq(programVolumes.slug, input.items[0]!.volumeSlug));
      expect(await initializePaystackBasketCheckout(input)).toEqual(first);
      expect((await attempts(input))[0]?.amountCents).toBe(30000);
    });

    it('keeps provider timeouts uncertain and never initializes another reference on retry', async () => {
      const input = await basket();
      const fetch = vi.fn().mockRejectedValue(new Error('Timeout'));
      vi.stubGlobal('$fetch', fetch);
      await expect(initializePaystackBasketCheckout(input)).rejects.toMatchObject({ statusCode: 502 });
      const [reserved] = await attempts(input);
      expect(reserved).toMatchObject({ status: 'pending', providerStatus: 'initialization_uncertain' });
      await expect(initializePaystackBasketCheckout(input)).rejects.toMatchObject({ statusCode: 409 });
      expect(fetch.mock.calls.filter(call => call[0] === 'https://api.paystack.co/transaction/initialize')).toHaveLength(1);
      expect(await attempts(input)).toHaveLength(1);
      const [order] = await getDatabase().select().from(orders).where(eq(orders.id, reserved!.orderId));
      expect(order?.status).toBe('pending');
    });

    it('reconciles an uncertain attempt through verified success on the same reference', async () => {
      const input = await basket();
      vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('Timeout')));
      await expect(initializePaystackBasketCheckout(input)).rejects.toMatchObject({ statusCode: 502 });
      const [reserved] = await attempts(input);
      vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ status: true, message: 'Verified', data: {
        id: reserved!.id, reference: reserved!.providerReference, amount: 30000, currency: 'ZAR', domain: 'test', status: 'success',
      } }));
      const result = await initializePaystackBasketCheckout(input);
      expect(new URL(result.authorizationUrl).pathname).toBe('/checkout/complete');
      expect(new URL(result.authorizationUrl).searchParams.get('reference')).toBe(reserved?.providerReference);
      expect((await attempts(input))[0]?.status).toBe('succeeded');
      expect(await getDatabase().select().from(programAccess).innerJoin(orderItems, eq(orderItems.id, programAccess.orderItemId)).where(eq(orderItems.orderId, reserved!.orderId))).toHaveLength(2);
    });

    it.each([
      { status: true, data: { reference: 'wrong', access_code: 'code', authorization_url: 'https://checkout.paystack.com/code' } },
      { status: true, data: { access_code: 'code', authorization_url: 'https://evil.test/' } },
      null,
    ])('reserves malformed provider results for review: %j', async response => {
      const input = await basket();
      vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(response));
      await expect(initializePaystackBasketCheckout(input)).rejects.toMatchObject({ statusCode: 502 });
      expect((await attempts(input))[0]).toMatchObject({ status: 'pending', providerStatus: 'initialization_uncertain', checkoutUrl: null });
    });

    it('distinguishes explicit rejection from uncertainty and does not retry a rejected reference', async () => {
      const input = await basket();
      const fetch = vi.fn().mockResolvedValue({ status: false, message: 'Rejected' });
      vi.stubGlobal('$fetch', fetch);
      await expect(initializePaystackBasketCheckout(input)).rejects.toMatchObject({ statusCode: 502 });
      expect((await attempts(input))[0]?.status).toBe('failed');
      expect(new URL((await initializePaystackBasketCheckout(input)).authorizationUrl).pathname).toBe('/checkout/complete');
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('preserves a webhook that settles while initialization is still returning', async () => {
      const input = await basket();
      vi.stubGlobal('$fetch', vi.fn().mockImplementation(async (_url: string, options: { body: { reference: string } }) => {
        await charge(options.body.reference);
        return { status: true, data: { reference: options.body.reference, access_code: 'code', authorization_url: 'https://checkout.paystack.com/code' } };
      }));
      const result = await initializePaystackBasketCheckout(input);
      expect(new URL(result.authorizationUrl).pathname).toBe('/checkout/complete');
      expect((await attempts(input))[0]).toMatchObject({ status: 'succeeded', providerStatus: 'success' });
    });

    it('does not downgrade a webhook success when the initialization response is lost', async () => {
      const input = await basket();
      vi.stubGlobal('$fetch', vi.fn().mockImplementation(async (_url: string, options: { body: { reference: string } }) => {
        await charge(options.body.reference);
        throw new Error('Response lost');
      }));
      const result = await initializePaystackBasketCheckout(input);
      expect(new URL(result.authorizationUrl).pathname).toBe('/checkout/complete');
      expect((await attempts(input))[0]).toMatchObject({ status: 'succeeded', providerStatus: 'success' });
    });

    it('treats a crashed initialization claim as uncertain and never sends another initialization', async () => {
      const input = await basket();
      vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('Provider unavailable')));
      await expect(initializePaystackBasketCheckout(input)).rejects.toMatchObject({ statusCode: 502 });
      const [reserved] = await attempts(input);
      await getDatabase().update(payments).set({ providerStatus: 'initializing', updatedAt: new Date(Date.now() - 60000) }).where(eq(payments.id, reserved!.id));
      const fetch = vi.fn().mockRejectedValue(new Error('Provider unavailable'));
      vi.stubGlobal('$fetch', fetch);
      await expect(initializePaystackBasketCheckout(input)).rejects.toMatchObject({ statusCode: 409 });
      expect(fetch.mock.calls.every(call => String(call[0]).includes('/transaction/verify/'))).toBe(true);
      expect(await attempts(input)).toHaveLength(1);
    });

    it('allows a deliberate later purchase with a fresh key, while settled retries return completion', async () => {
      const input = await basket();
      const fetch = successfulInitialize();
      vi.stubGlobal('$fetch', fetch);
      const first = await initializePaystackBasketCheckout(input);
      await charge(first.reference);
      const retry = await initializePaystackBasketCheckout(input);
      expect(new URL(retry.authorizationUrl).hostname).toBe('website.example.test');
      const later = await initializePaystackBasketCheckout({ ...input, idempotencyKey: randomUUID() });
      expect(later.reference).not.toBe(first.reference);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('uses the same idempotency protection on legacy single-volume checkout', async () => {
      const input = await basket();
      const fetch = successfulInitialize();
      vi.stubGlobal('$fetch', fetch);
      const single = { ...input, ...input.items[0]! };
      const first = await initializePaystackCheckout(single);
      expect(await initializePaystackCheckout(single)).toEqual(first);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('rolls back invalid-price baskets before reserving a payable intent', async () => {
      const input = await basket();
      vi.stubGlobal('$fetch', successfulInitialize());
      await expect(initializePaystackBasketCheckout({ ...input, items: [{ ...input.items[0]!, expectedPriceCents: 1 }] })).rejects.toMatchObject({ statusCode: 409 });
      expect(await attempts(input)).toHaveLength(0);
      await initializePaystackBasketCheckout(input);
      expect(await attempts(input)).toHaveLength(1);
    });

    it('enforces hash pairing and checkout-key uniqueness in PostgreSQL', async () => {
      const input = await basket();
      vi.stubGlobal('$fetch', successfulInitialize());
      await initializePaystackBasketCheckout(input);
      const [payment] = await attempts(input);
      await expect(getDatabase().update(payments).set({ checkoutIntentKeyHash: null }).where(eq(payments.id, payment!.id))).rejects.toThrow();
      await expect(getDatabase().insert(payments).values({
        orderId: payment!.orderId, provider: 'paystack', environment: 'test', amountCents: 30000,
        providerReference: `TVT-${randomUUID()}`, checkoutIntentKeyHash: payment!.checkoutIntentKeyHash,
        checkoutRequestHash: payment!.checkoutRequestHash,
      })).rejects.toThrow();
      expect(await getDatabase().select().from(payments).where(and(eq(payments.orderId, payment!.orderId), eq(payments.provider, 'paystack')))).toHaveLength(1);
    });
  });
}
