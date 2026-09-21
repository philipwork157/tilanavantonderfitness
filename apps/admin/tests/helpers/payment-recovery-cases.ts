import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@tilana/db/server';
import { eq, sql } from 'drizzle-orm';
import { paymentDisputes, paymentEvents, paymentRecoveryJobs, paymentRefunds } from '@tilana/db/schema';
import { processPaystackEvent } from '@server/services/paystack';
import { reconcilePayment, redactExpiredPaymentEventPayloads, replayPaymentEvent, requestPaymentRecovery, runPaymentRecovery } from '@server/services/payment-recovery';
import { deliverPaymentRecoveryAlerts } from '@server/services/payment-recovery-alerts';
import { createBarrier, readPaymentState, seedPendingPayment, type PaymentFixture } from './paystack-database';
import { seedRecoveryActor } from './recovery-audit-cases';

/** Real financial records and locks; mocked provider/email transport, never external money or mail. */
export function registerRecoveryCases(getDatabase: () => Database, send: ReturnType<typeof vi.fn>) {
  let actor: number;
  const config = { paystackEnvironment: 'test', paystackSecretKey: 'sk_test_fixture', paystackRecoveryAlertTo: '' };
  const charge = (fixture: PaymentFixture) => ({
    id: fixture.paymentId, reference: fixture.reference, amount: 10000, currency: 'ZAR', domain: 'test', status: 'success',
  });
  const refund = (fixture: PaymentFixture, amount = 3000) => ({
    id: `refund-${fixture.paymentId}`, transaction: String(fixture.paymentId), domain: 'test',
    amount, currency: 'ZAR', status: 'processed',
  });
  const dispute = (fixture: PaymentFixture, status = 'pending', resolution: string | null = null) => ({
    id: `dispute-${fixture.paymentId}`, domain: 'test', status, resolution, refund_amount: 10000,
    transaction: { id: fixture.paymentId, reference: fixture.reference, domain: 'test', amount: 10000, currency: 'ZAR' },
  });
  function provider(fixture: PaymentFixture, refunds: unknown[] = [], disputes: unknown[] = []) {
    const fetch = vi.fn().mockImplementation((url: string) => url.includes('/transaction/verify/')
      ? { status: true, message: 'Verified', data: charge(fixture) }
      : { status: true, data: url.endsWith('/refund') ? refunds : disputes });
    vi.stubGlobal('$fetch', fetch);
    return fetch;
  }
  async function confirm(fixture: PaymentFixture) {
    await processPaystackEvent({ event: 'charge.success', data: charge(fixture) }, `initial:${fixture.reference}`);
  }
  const jobFor = async (fixture: PaymentFixture) => (await getDatabase().select().from(paymentRecoveryJobs)
    .where(eq(paymentRecoveryJobs.paymentId, fixture.paymentId)))[0]!;

  describe('durable payment recovery against PostgreSQL', () => {
    beforeEach(async () => {
      actor = await seedRecoveryActor(getDatabase());
      vi.stubGlobal('useRuntimeConfig', () => config);
      // Isolate due work, not financial data, in this explicitly disposable database.
      await getDatabase().execute(sql`
        insert into payment_recovery_jobs (payment_id, next_attempt_at)
        select id, now() + interval '1 day' from payments where provider = 'paystack'
        on conflict (payment_id) do update set next_attempt_at = now() + interval '1 day', lease_until = null, alert_pending = false
      `);
    });
    it('fulfills closed-browser success without a webhook, charge or refund creation', async () => {
      const fixture = await seedPendingPayment(getDatabase());
      const fetch = provider(fixture);
      await reconcilePayment(fixture.paymentId);
      expect(await readPaymentState(getDatabase(), fixture)).toMatchObject({ payment: { status: 'succeeded' }, order: { status: 'paid' } });
      expect((await readPaymentState(getDatabase(), fixture)).access).toHaveLength(1);
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(fetch.mock.calls.every(call => call[1].method !== 'POST')).toBe(true);
    });
    it('reconciles an uncertain refund reservation after its webhook is missed', async () => {
      const fixture = await seedPendingPayment(getDatabase());
      await confirm(fixture);
      await getDatabase().insert(paymentRefunds).values({ paymentId: fixture.paymentId, amountCents: 3000, currency: 'ZAR', status: 'needs-attention' });
      provider(fixture, [refund(fixture)]);
      await reconcilePayment(fixture.paymentId);
      expect((await readPaymentState(getDatabase(), fixture)).payment).toMatchObject({ status: 'partially_refunded', refundedAmountCents: 3000 });
      const rows = await getDatabase().select().from(paymentRefunds).where(eq(paymentRefunds.paymentId, fixture.paymentId));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ status: 'processed', providerRefundId: `refund-${fixture.paymentId}` });
    });
    it('retains and automatically retries refund-before-charge evidence under its original key', async () => {
      const fixture = await seedPendingPayment(getDatabase());
      const key = `early-refund:${fixture.reference}`;
      await processPaystackEvent({ event: 'refund.processed', data: { ...refund(fixture, 10000), transaction_reference: fixture.reference } }, key);
      expect((await getDatabase().select().from(paymentEvents).where(eq(paymentEvents.providerEventKey, key)))[0]?.processingStatus).toBe('received');
      provider(fixture);
      await reconcilePayment(fixture.paymentId);
      expect((await readPaymentState(getDatabase(), fixture)).payment?.status).toBe('refunded');
      expect((await getDatabase().select().from(paymentEvents).where(eq(paymentEvents.providerEventKey, key)))[0]?.processingStatus).toBe('processed');
      expect((await readPaymentState(getDatabase(), fixture)).access.every(row => row.status === 'revoked')).toBe(true);
    });
    it('persists allowlisted evidence and expires replay details without changing its digest', async () => {
      const fixture = await seedPendingPayment(getDatabase());
      const key = `minimal:${fixture.reference}`;
      await processPaystackEvent({
        event: 'charge.success',
        data: {
          ...charge(fixture),
          customer: { email: 'private@example.test' },
          authorization: { authorization_code: 'AUTH_reusable' },
          metadata: { phone: 'private' },
        },
      }, key);
      let [event] = await getDatabase().select().from(paymentEvents).where(eq(paymentEvents.providerEventKey, key));
      expect(event?.payloadDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(event?.payloadExpiresAt).toBeInstanceOf(Date);
      expect(JSON.stringify(event?.payload)).not.toMatch(/private|authorization|AUTH_|metadata|customer/);
      const digest = event!.payloadDigest;
      await getDatabase().update(paymentEvents).set({ payloadExpiresAt: new Date(0) }).where(eq(paymentEvents.id, event!.id));
      await redactExpiredPaymentEventPayloads();
      [event] = await getDatabase().select().from(paymentEvents).where(eq(paymentEvents.id, event!.id));
      expect(event).toMatchObject({ payload: { redacted: true }, payloadDigest: digest, payloadExpiresAt: null });
    });
    it('persists timeout backoff without exposing arbitrary exceptions or failing the payment', async () => {
      const fixture = await seedPendingPayment(getDatabase());
      await requestPaymentRecovery(fixture.paymentId, actor);
      vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('Bearer secret and customer@email.test')));
      expect(await runPaymentRecovery()).toMatchObject({ retried: 1 });
      expect(await jobFor(fixture)).toMatchObject({ attempts: 1, leaseUntil: null });
      expect(JSON.stringify(await jobFor(fixture))).not.toContain('Bearer');
      expect((await readPaymentState(getDatabase(), fixture)).payment?.status).toBe('pending');
    });
    it('alerts after repeated provider failures while keeping uncertain money recoverable', async () => {
      const fixture = await seedPendingPayment(getDatabase());
      await requestPaymentRecovery(fixture.paymentId, actor);
      await getDatabase().update(paymentRecoveryJobs).set({ attempts: 7 }).where(eq(paymentRecoveryJobs.paymentId, fixture.paymentId));
      vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('Timeout')));
      await runPaymentRecovery();
      expect(await jobFor(fixture)).toMatchObject({ attempts: 8, alertPending: true, reviewReason: 'Payment/refund recovery needs Paystack review.' });
    });
    it('leases one payment across concurrent workers without duplicate fulfillment', async () => {
      const fixture = await seedPendingPayment(getDatabase());
      await requestPaymentRecovery(fixture.paymentId, actor);
      const requested = createBarrier();
      const release = createBarrier();
      const fetch = provider(fixture);
      fetch.mockImplementationOnce(async () => { requested.resolve(); await release.promise; return { status: true, message: 'Verified', data: charge(fixture) }; });
      const first = runPaymentRecovery();
      await requested.promise;
      try { expect(await runPaymentRecovery()).toMatchObject({ processed: 0, retried: 0 }); }
      finally { release.resolve(); await first; }
      expect(fetch.mock.calls.filter(call => call[0].includes('/transaction/verify/'))).toHaveLength(1);
      expect((await readPaymentState(getDatabase(), fixture)).access).toHaveLength(1);
    });
    it('recovers an expired lease left by a crashed worker', async () => {
      const fixture = await seedPendingPayment(getDatabase());
      await requestPaymentRecovery(fixture.paymentId, actor);
      await getDatabase().update(paymentRecoveryJobs).set({ leaseVersion: 4, leaseUntil: new Date(0) }).where(eq(paymentRecoveryJobs.paymentId, fixture.paymentId));
      provider(fixture);
      await runPaymentRecovery();
      expect(await jobFor(fixture)).toMatchObject({ leaseVersion: 5, leaseUntil: null, attempts: 0 });
    });
    it('does not conclude an unresolved refund failed merely because the provider list is empty', async () => {
      const fixture = await seedPendingPayment(getDatabase());
      await confirm(fixture);
      await getDatabase().insert(paymentRefunds).values({ paymentId: fixture.paymentId, amountCents: 3000, currency: 'ZAR', status: 'needs-attention' });
      provider(fixture);
      await expect(reconcilePayment(fixture.paymentId)).rejects.toThrow('stays reserved');
      expect((await getDatabase().select().from(paymentRefunds).where(eq(paymentRefunds.paymentId, fixture.paymentId)))[0]?.status).toBe('needs-attention');
    });
    it('keeps access for open disputes and records an operator alert', async () => {
      const fixture = await seedPendingPayment(getDatabase());
      provider(fixture, [], [dispute(fixture)]);
      await reconcilePayment(fixture.paymentId);
      expect((await readPaymentState(getDatabase(), fixture)).payment?.status).toBe('succeeded');
      expect((await readPaymentState(getDatabase(), fixture)).access[0]?.status).toBe('active');
      expect(await jobFor(fixture)).toMatchObject({ alertPending: true });
    });
    it('revokes a confirmed accepted dispute without inventing a refund or allowing later refund events to restore access', async () => {
      const fixture = await seedPendingPayment(getDatabase());
      provider(fixture, [], [dispute(fixture, 'resolved', 'merchant-accepted')]);
      await reconcilePayment(fixture.paymentId);
      expect((await readPaymentState(getDatabase(), fixture)).payment).toMatchObject({ status: 'reversed', refundedAmountCents: 0 });
      await processPaystackEvent({ event: 'refund.processed', data: { ...refund(fixture), transaction_reference: fixture.reference } }, `later-refund:${fixture.reference}`);
      expect((await readPaymentState(getDatabase(), fixture)).payment?.status).toBe('reversed');
      expect((await readPaymentState(getDatabase(), fixture)).access[0]?.status).toBe('revoked');
    });
    it('periodically detects a verified reversal of an already successful payment', async () => {
      const fixture = await seedPendingPayment(getDatabase());
      await confirm(fixture);
      const fetch = provider(fixture);
      fetch.mockImplementationOnce(() => ({ status: true, message: 'Reversed', data: { ...charge(fixture), status: 'reversed' } }));
      await reconcilePayment(fixture.paymentId);
      expect((await readPaymentState(getDatabase(), fixture)).payment?.status).toBe('reversed');
      expect((await readPaymentState(getDatabase(), fixture)).access[0]?.status).toBe('revoked');
      expect(await jobFor(fixture)).toMatchObject({ alertPending: true, reviewReason: 'Verified payment reversal requires accounting review.' });
    });
    it('rejects cross-payment dispute evidence before creating a dispute or revoking access', async () => {
      const fixture = await seedPendingPayment(getDatabase());
      const row = dispute(fixture, 'resolved', 'merchant-accepted');
      row.transaction.reference = 'another-reference';
      provider(fixture, [], [row]);
      await expect(reconcilePayment(fixture.paymentId)).rejects.toThrow('ownership');
      expect(await getDatabase().select().from(paymentDisputes).where(eq(paymentDisputes.paymentId, fixture.paymentId))).toHaveLength(0);
      expect((await readPaymentState(getDatabase(), fixture)).access[0]?.status).toBe('active');
    });
    it('replays trusted deferred evidence and preserves the original ledger row', async () => {
      const fixture = await seedPendingPayment(getDatabase());
      const key = `operator-early:${fixture.reference}`;
      await processPaystackEvent({ event: 'refund.processed', data: { ...refund(fixture), transaction_reference: fixture.reference } }, key);
      const [event] = await getDatabase().select().from(paymentEvents).where(eq(paymentEvents.providerEventKey, key));
      await confirm(fixture);
      expect(await replayPaymentEvent(event!.id, 7)).toMatchObject({ processingStatus: 'processed' });
      expect((await getDatabase().select().from(paymentEvents).where(eq(paymentEvents.id, event!.id)))[0]?.processingStatus).toBe('received');
      expect((await readPaymentState(getDatabase(), fixture)).payment?.refundedAmountCents).toBe(3000);
    });
    it('keeps failed alert delivery durable and retries without customer data', async () => {
      const fixture = await seedPendingPayment(getDatabase());
      await requestPaymentRecovery(fixture.paymentId, actor);
      await getDatabase().update(paymentRecoveryJobs).set({ alertPending: true, reviewReason: 'Review payment.' }).where(eq(paymentRecoveryJobs.paymentId, fixture.paymentId));
      vi.stubGlobal('useRuntimeConfig', () => ({ ...config, paystackRecoveryAlertTo: 'ops@example.test' }));
      send.mockRejectedValueOnce(new Error('SES unavailable'));
      expect(await deliverPaymentRecoveryAlerts()).toEqual({ sent: 0, failed: 1 });
      expect((await jobFor(fixture)).alertPending).toBe(true);
      send.mockResolvedValueOnce({ messageId: 'test' });
      expect(await deliverPaymentRecoveryAlerts()).toEqual({ sent: 1, failed: 0 });
      expect((await jobFor(fixture)).alertPending).toBe(false);
      expect(send.mock.calls.at(-1)?.[0].text).not.toContain('@'); // Recipient addresses are allowed; customer emails are not in alert bodies.
    });
    it('alerts invalid signed evidence and records administrator acknowledgement without altering money', async () => {
      const fixture = await seedPendingPayment(getDatabase());
      await processPaystackEvent({ event: 'charge.success', data: { ...charge(fixture), amount: 1 } }, `invalid:${fixture.reference}`);
      expect(await jobFor(fixture)).toMatchObject({ alertPending: true });
      expect(await requestPaymentRecovery(fixture.paymentId, actor, 'acknowledge')).toEqual({ acknowledged: true });
      expect(await jobFor(fixture)).toMatchObject({ alertPending: false, reviewReason: null });
      expect((await readPaymentState(getDatabase(), fixture)).payment?.status).toBe('pending');
      const audit = await getDatabase().select().from(paymentEvents).where(eq(paymentEvents.paymentId, fixture.paymentId));
      expect(audit.some(event => event.eventType === 'admin.recovery.acknowledge' && event.actorUserId === actor)).toBe(true);
    });
    it('does not let an operator steal an active recovery lease', async () => {
      const fixture = await seedPendingPayment(getDatabase());
      await requestPaymentRecovery(fixture.paymentId, actor);
      await getDatabase().update(paymentRecoveryJobs).set({ leaseUntil: new Date(Date.now() + 60_000) }).where(eq(paymentRecoveryJobs.paymentId, fixture.paymentId));
      await expect(requestPaymentRecovery(fixture.paymentId, actor)).rejects.toMatchObject({ statusCode: 409 });
    });
    it('rejects replay of already-processed evidence', async () => {
      const fixture = await seedPendingPayment(getDatabase());
      await confirm(fixture);
      const [event] = await getDatabase().select().from(paymentEvents).where(eq(paymentEvents.paymentId, fixture.paymentId));
      await expect(replayPaymentEvent(event!.id, 7)).rejects.toMatchObject({ statusCode: 409 });
    });
    it('fails closed when bounded provider pagination cannot prove it reached the end', async () => {
      const fixture = await seedPendingPayment(getDatabase());
      const rows = Array.from({ length: 100 }, (_value, index) => ({ ...refund(fixture, 1), id: `page-${fixture.paymentId}-${index}` }));
      const fetch = provider(fixture, rows);
      await expect(reconcilePayment(fixture.paymentId)).rejects.toThrow('pagination');
      expect(fetch.mock.calls.filter(call => call[0].endsWith('/refund'))).toHaveLength(3);
      expect(await getDatabase().select().from(paymentRefunds).where(eq(paymentRefunds.paymentId, fixture.paymentId))).toHaveLength(0);
    });
    it('accepts a later confirmed adverse resolution after a previously declined dispute', async () => {
      const fixture = await seedPendingPayment(getDatabase());
      provider(fixture, [], [dispute(fixture, 'resolved', 'declined')]);
      await reconcilePayment(fixture.paymentId);
      expect((await readPaymentState(getDatabase(), fixture)).access[0]?.status).toBe('active');
      provider(fixture, [], [dispute(fixture, 'resolved', 'merchant-accepted')]);
      await reconcilePayment(fixture.paymentId);
      expect((await readPaymentState(getDatabase(), fixture)).payment?.status).toBe('reversed');
      expect((await readPaymentState(getDatabase(), fixture)).access[0]?.status).toBe('revoked');
    });
  });
}
