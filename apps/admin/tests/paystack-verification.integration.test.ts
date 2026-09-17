import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@tilana/db/server';
import { initiatePaystackRefund, processPaystackEvent, verifyPaystackCheckout } from '@server/services/paystack';
import { paymentEvents, paymentRefunds, users } from '@tilana/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { registerCheckoutCases } from './helpers/paystack-checkout-cases';
import { assertPaystackDatabaseEnvironment } from '@server/utils/paystack-configuration';
import { linkVerifiedCustomerAccount, requireCustomer } from '@server/utils/customer-auth';
import type { H3Event } from 'h3';
import {
  createBarrier,
  createPaystackTestDatabase,
  readPaymentState,
  seedPendingPayment,
  type PaymentFixture,
} from './helpers/paystack-database';

const mocks = vi.hoisted(() => ({ getDatabase: vi.fn(), createSupabaseAuthClient: vi.fn() }));
vi.mock('@server/utils/database', () => mocks);
vi.mock('@server/utils/supabase-auth', () => ({ createSupabaseAuthClient: mocks.createSupabaseAuthClient }));
let database: Database;
registerCheckoutCases(() => database);

describe('Paystack database environment isolation', () => {
  it('permits the configured test database', async () => {
    await seedPendingPayment(database);
    await expect(assertPaystackDatabaseEnvironment()).resolves.toBeUndefined();
  });
  it.each(['link', 'session', 'verify', 'webhook', 'refund'])(
    'quarantines test financial history before live %s operations', async (operation) => {
      const fixture = await seedPendingPayment(database);
      await confirmCharge(fixture);
      const fetch = vi.fn();
      vi.stubGlobal('$fetch', fetch);
      vi.stubGlobal('useRuntimeConfig', () => ({ paystackSecretKey: 'sk_live_fixture', paystackEnvironment: 'live' }));
      const actions = {
        link: () => linkVerifiedCustomerAccount({} as H3Event),
        session: () => requireCustomer({} as H3Event),
        verify: () => verifyPaystackCheckout(fixture.reference),
        webhook: () => processPaystackEvent({ event: 'charge.success', data: verification(fixture, 'success').data }, `live-test-${fixture.reference}`),
        refund: () => initiatePaystackRefund(fixture.orderId, { amountCents: 1000 }, 1),
      };
      await expect(actions[operation as keyof typeof actions]()).rejects.toMatchObject({ statusCode: 503 });
      expect(fetch).not.toHaveBeenCalled();
      expect(mocks.createSupabaseAuthClient).not.toHaveBeenCalled();
      expect((await readPaymentState(database, fixture)).access).toHaveLength(1);
    },
  );
});

/** Provider evidence is local fixture data; these tests never call Paystack. */
function verification(fixture: PaymentFixture, status: string) {
  return {
    status: true,
    message: 'Verification successful',
    data: {
      id: fixture.paymentId, reference: fixture.reference, amount: 10000,
      currency: 'ZAR', domain: 'test', status, paid_at: '2026-09-17T10:00:00.000Z',
    },
  };
}

/** Exercise real webhook fulfillment, including locks, constraints, and access grants. */
async function confirmCharge(fixture: PaymentFixture) {
  await processPaystackEvent({
    event: 'charge.success', data: verification(fixture, 'success').data,
  }, `test-success-${fixture.reference}`);
}

/** Exercise a real refund transaction after the charge has been confirmed. */
async function confirmRefund(fixture: PaymentFixture, amount: number) {
  await processPaystackEvent({
    event: 'refund.processed',
    data: {
      transaction_reference: fixture.reference, id: `test-refund-${fixture.paymentId}`,
      amount, currency: 'ZAR', domain: 'test', status: 'processed',
    },
  }, `test-refund-${fixture.reference}`);
}

beforeAll(async () => { database = await createPaystackTestDatabase(); });
afterAll(async () => { await database?.$client.end(); });
beforeEach(() => {
  mocks.getDatabase.mockReturnValue(database);
  vi.stubGlobal('useRuntimeConfig', () => ({ paystackSecretKey: 'sk_test_integration_fixture', paystackEnvironment: 'test' }));
  vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) =>
    Object.assign(new Error(input.statusMessage), input));
});

describe('Paystack verification against PostgreSQL', () => {
  it.each([
    ['failed', 'failed', 'cancelled', 0],
    ['abandoned', 'abandoned', 'cancelled', 0],
    ['reversed', 'reversed', 'refunded', 10000],
    ['pending', 'pending', 'pending', 0],
    ['ongoing', 'pending', 'pending', 0],
  ])('applies a matching %s response to a pending payment', async (providerStatus, paymentStatus, orderStatus, refundedCents) => {
    const fixture = await seedPendingPayment(database);
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(verification(fixture, String(providerStatus))));
    await verifyPaystackCheckout(fixture.reference);
    const result = await readPaymentState(database, fixture);
    expect(result.payment).toMatchObject({ status: paymentStatus, refundedAmountCents: refundedCents });
    expect(result.order?.status).toBe(orderStatus);
    expect(result.access).toHaveLength(0);
  });

  it('fulfills matching success once and preserves access on repeated verification', async () => {
    const fixture = await seedPendingPayment(database);
    const fetch = vi.fn().mockResolvedValue(verification(fixture, 'success'));
    vi.stubGlobal('$fetch', fetch);
    await verifyPaystackCheckout(fixture.reference);
    const fulfilled = await readPaymentState(database, fixture);
    expect(fulfilled.payment?.status).toBe('succeeded');
    expect(fulfilled.order?.status).toBe('paid');
    expect(fulfilled.access).toHaveLength(1);
    expect(fulfilled.access[0]?.status).toBe('active');
    await verifyPaystackCheckout(fixture.reference);
    expect(await readPaymentState(database, fixture)).toEqual(fulfilled);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  for (const settledStatus of ['succeeded', 'partially_refunded', 'refunded', 'reversed']) {
    it.each(['failed', 'abandoned', 'reversed', 'ongoing', 'success'])(
      `ignores a stale %s response after the payment becomes ${settledStatus}`,
      async (staleStatus) => {
        const fixture = await seedPendingPayment(database);
        const requested = createBarrier();
        const response = createBarrier<ReturnType<typeof verification>>();
        vi.stubGlobal('$fetch', vi.fn().mockImplementationOnce(() => {
          requested.resolve();
          return response.promise;
        }).mockResolvedValue(verification(fixture, 'reversed')));
        const pendingVerification = verifyPaystackCheckout(fixture.reference);
        await requested.promise;
        try {
          if (settledStatus === 'reversed') {
            await verifyPaystackCheckout(fixture.reference);
          } else {
            await confirmCharge(fixture);
            if (settledStatus !== 'succeeded') {
              await confirmRefund(fixture, settledStatus === 'refunded' ? 10000 : 3000);
            }
          }
          const settled = await readPaymentState(database, fixture);
          expect(settled.payment?.status).toBe(settledStatus);
          response.resolve(verification(fixture, staleStatus));
          await pendingVerification;
          expect(await readPaymentState(database, fixture)).toEqual(settled);
        } finally {
          response.resolve(verification(fixture, staleStatus));
          await pendingVerification;
        }
      },
    );
  }

  it('rechecks pending after waiting for an uncommitted webhook row lock', async () => {
    const fixture = await seedPendingPayment(database);
    const requested = createBarrier();
    const response = createBarrier<ReturnType<typeof verification>>();
    vi.stubGlobal('$fetch', vi.fn().mockImplementation(() => {
      requested.resolve();
      return response.promise;
    }));
    const pendingVerification = verifyPaystackCheckout(fixture.reference);
    await requested.promise;

    const webhookReady = createBarrier();
    const commitWebhook = createBarrier();
    // Hold the real webhook transaction open after fulfillment but before COMMIT.
    mocks.getDatabase.mockReturnValue({
      select: database.select.bind(database),
      transaction: (callback: Parameters<Database['transaction']>[0]) => database.transaction(async (transaction) => {
        const result = await callback(transaction);
        webhookReady.resolve();
        await commitWebhook.promise;
        return result;
      }),
    });
    const webhook = confirmCharge(fixture);
    try {
      await webhookReady.promise;
      response.resolve(verification(fixture, 'reversed'));
      await vi.waitFor(async () => {
        const blocked = await database.$client`
          select pid from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'
            and query like 'update "payments"%'
        `;
        expect(blocked.length).toBeGreaterThan(0);
      }, { timeout: 5000 });
    } finally {
      response.resolve(verification(fixture, 'reversed'));
      commitWebhook.resolve();
      await Promise.all([webhook, pendingVerification]);
      mocks.getDatabase.mockReturnValue(database);
    }
    const result = await readPaymentState(database, fixture);
    expect(result.payment).toMatchObject({ status: 'succeeded', refundedAmountCents: 0, providerStatus: 'success' });
    expect(result.order?.status).toBe('paid');
    expect(result.access[0]?.status).toBe('active');
  });

  it('allows a later authentic success after verification recorded failure', async () => {
    const fixture = await seedPendingPayment(database);
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(verification(fixture, 'failed')));
    await verifyPaystackCheckout(fixture.reference);
    expect((await readPaymentState(database, fixture)).order?.status).toBe('cancelled');
    await confirmCharge(fixture);
    const result = await readPaymentState(database, fixture);
    expect(result.payment?.status).toBe('succeeded');
    expect(result.order?.status).toBe('paid');
    expect(result.access[0]?.status).toBe('active');
  });

  it('rolls back payment and order changes together when the transaction fails', async () => {
    const fixture = await seedPendingPayment(database);
    const before = await readPaymentState(database, fixture);
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(verification(fixture, 'failed')));
    mocks.getDatabase.mockReturnValue({
      select: database.select.bind(database),
      transaction: (callback: Parameters<Database['transaction']>[0]) => database.transaction(async (transaction) => {
        await callback(transaction);
        throw new Error('Simulated transaction failure');
      }),
    });
    await expect(verifyPaystackCheckout(fixture.reference)).rejects.toThrow('Simulated transaction failure');
    expect(await readPaymentState(database, fixture)).toEqual(before);
  });
});

/** Refund fixtures exercise real reservations and signed-event reconciliation. */
async function refundFixture() {
  const fixture = await seedPendingPayment(database);
  await confirmCharge(fixture);
  const uuid = randomUUID();
  await database.$client`insert into auth.users (id) values (${uuid})`;
  const [administrator] = await database.insert(users).values({ supabaseId: uuid, firstName: 'Test', lastName: 'Admin', email: `${uuid}@example.test` }).returning();
  if (!administrator) throw new Error('Test administrator could not be seeded.');
  return { ...fixture, administratorId: administrator.id };
}

function refundResponse(fixture: PaymentFixture, amount: number, status = 'pending') {
  return { status: true, message: 'Queued', data: {
    id: `api-${fixture.paymentId}`, amount, currency: 'ZAR', domain: 'test', status,
  } };
}

async function refundEvent(fixture: PaymentFixture, amount: number, status: string, identity: Record<string, unknown> = {}) {
  const key = randomUUID();
  await processPaystackEvent({ event: `refund.${status}`, data: {
    transaction_reference: fixture.reference, amount, currency: 'ZAR', domain: 'test', status,
    refund_reference: null, ...identity,
  } }, key);
  return key;
}

async function refundsFor(fixture: PaymentFixture) {
  return database.select().from(paymentRefunds).where(eq(paymentRefunds.paymentId, fixture.paymentId));
}

describe('Paystack refund identity against PostgreSQL', () => {
  beforeEach(() => vi.stubGlobal('useRuntimeConfig', () => ({
    paystackSecretKey: 'sk_test_integration_fixture', paystackEnvironment: 'test',
  })));

  it.each([3000, 10000])('matches an ID-less webhook to the API reservation for %i cents', async (amount) => {
    const fixture = await refundFixture();
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(refundResponse(fixture, amount)));
    const requested = await initiatePaystackRefund(fixture.orderId, { amountCents: amount }, fixture.administratorId);
    await refundEvent(fixture, amount, 'processed');
    await refundEvent(fixture, amount, 'processed');
    await refundEvent(fixture, amount, 'pending');
    const refunds = await refundsFor(fixture);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ id: requested.id, status: 'processed', providerRefundId: `api-${fixture.paymentId}` });
    const state = await readPaymentState(database, fixture);
    expect(state.payment?.refundedAmountCents).toBe(amount);
    expect(state.order?.status).toBe(amount === 10000 ? 'refunded' : 'paid');
    expect(state.access[0]?.status).toBe(amount === 10000 ? 'revoked' : 'active');
  });

  it('preserves distinct numeric API IDs and webhook references', async () => {
    const fixture = await refundFixture();
    const response = refundResponse(fixture, 3000);
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ ...response, data: { ...response.data, id: 123456 } }));
    await initiatePaystackRefund(fixture.orderId, { amountCents: 3000 }, fixture.administratorId);
    await refundEvent(fixture, 3000, 'processed', { refund_reference: `processor-${fixture.paymentId}` });
    await refundEvent(fixture, 3000, 'processing', { refund_reference: `processor-${fixture.paymentId}` });
    expect(await refundsFor(fixture)).toMatchObject([{ providerRefundId: '123456', providerRefundReference: `processor-${fixture.paymentId}`, status: 'processed' }]);
  });

  it('handles a processed webhook arriving before the pending API response', async () => {
    const fixture = await refundFixture();
    vi.stubGlobal('$fetch', vi.fn().mockImplementation(async () => {
      await refundEvent(fixture, 10000, 'processed', { refund_reference: `processor-${fixture.paymentId}` });
      return refundResponse(fixture, 10000);
    }));
    const result = await initiatePaystackRefund(fixture.orderId, { amountCents: 10000 }, fixture.administratorId);
    expect(result.status).toBe('processed');
    expect(await refundsFor(fixture)).toHaveLength(1);
    expect((await readPaymentState(database, fixture)).payment?.refundedAmountCents).toBe(10000);
  });

  it('keeps two equal partial refunds distinct and rejects ambiguous ID-less events', async () => {
    const fixture = await refundFixture();
    const response = refundResponse(fixture, 3000);
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue(response));
    await initiatePaystackRefund(fixture.orderId, { amountCents: 3000 }, fixture.administratorId);
    await refundEvent(fixture, 3000, 'processed', { id: response.data.id });
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ ...response, data: { ...response.data, id: `${response.data.id}-second` } }));
    await initiatePaystackRefund(fixture.orderId, { amountCents: 3000 }, fixture.administratorId);
    const ambiguousKey = await refundEvent(fixture, 3000, 'processed');
    const [event] = await database.select().from(paymentEvents).where(eq(paymentEvents.providerEventKey, ambiguousKey));
    expect(event?.processingStatus).toBe('failed');
    expect((await readPaymentState(database, fixture)).payment?.refundedAmountCents).toBe(3000);
    await refundEvent(fixture, 3000, 'processed', { id: `${response.data.id}-second` });
    expect(await refundsFor(fixture)).toHaveLength(2);
    expect((await readPaymentState(database, fixture)).payment?.refundedAmountCents).toBe(6000);
    await expect(initiatePaystackRefund(fixture.orderId, { amountCents: 5000 }, fixture.administratorId)).rejects.toThrow('remains refundable');
  });

  it('does not borrow another payment’s refund ID', async () => {
    const first = await refundFixture();
    const second = await refundFixture();
    await refundEvent(first, 3000, 'processed', { id: 'cross-payment-id' });
    const key = await refundEvent(second, 3000, 'processed', { id: 'cross-payment-id' });
    const [event] = await database.select().from(paymentEvents).where(eq(paymentEvents.providerEventKey, key));
    expect(event?.processingStatus).toBe('failed');
    expect(await refundsFor(second)).toHaveLength(0);
    expect((await readPaymentState(database, second)).payment?.refundedAmountCents).toBe(0);
  });

  it('keeps uncertain requests reserved and resolves them with the later webhook', async () => {
    const fixture = await refundFixture();
    vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('Timeout')));
    await expect(initiatePaystackRefund(fixture.orderId, { amountCents: 3000 }, fixture.administratorId)).rejects.toThrow('remains reserved');
    await expect(initiatePaystackRefund(fixture.orderId, { amountCents: 3000 }, fixture.administratorId)).rejects.toThrow('needs review');
    await refundEvent(fixture, 3000, 'processed');
    expect(await refundsFor(fixture)).toMatchObject([{ status: 'processed' }]);
  });
});
