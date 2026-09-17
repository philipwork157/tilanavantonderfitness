import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@tilana/db/server';
import { processPaystackEvent, verifyPaystackCheckout } from '@server/services/paystack';
import {
  createBarrier,
  createPaystackTestDatabase,
  readPaymentState,
  seedPendingPayment,
  type PaymentFixture,
} from './helpers/paystack-database';

const mocks = vi.hoisted(() => ({ getDatabase: vi.fn() }));
vi.mock('@server/utils/database', () => mocks);
let database: Database;

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
  vi.stubGlobal('useRuntimeConfig', () => ({ paystackSecretKey: 'sk_test_integration_fixture' }));
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
    mocks.getDatabase.mockReturnValueOnce({
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
