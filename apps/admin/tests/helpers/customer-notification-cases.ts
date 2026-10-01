import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Database } from '@tilana/db/server';
import { customerNotifications, orders } from '@tilana/db/schema';
import { eq } from 'drizzle-orm';
import { processPaystackEvent } from '@server/services/paystack';
import { deliverCustomerNotifications, queueCustomerLogin, runCustomerNotificationWorker } from '@server/services/customer-notifications';
import { seedPendingPayment } from './paystack-database';

/** Real migrated outbox tests, with SES and Supabase kept strictly mocked. */
export function registerCustomerNotificationCases(getDatabase: () => Database, send: Mock, generateLink: Mock) {
  describe('durable customer access notifications', () => {
    beforeEach(() => {
      vi.stubGlobal('useRuntimeConfig', () => ({ paystackSecretKey: 'sk_test_fixture', paystackEnvironment: 'test', accountBaseUrl: 'https://admin.example.test',
        emailDevelopmentEnabled: true, emailDevelopmentRecipient: 'safe@example.test', customerNotificationsEnabled: true }));
      send.mockResolvedValue({ messageId: 'fixture' });
      generateLink.mockResolvedValue({ data: { properties: { hashed_token: 'fixture-token' } }, error: null });
    });
    async function purchase() {
      const db = getDatabase();
      const fixture = await seedPendingPayment(db);
      const payload = { event: 'charge.success', data: { id: fixture.paymentId, reference: fixture.reference,
        amount: 10000, currency: 'ZAR', domain: 'test', status: 'success' } };
      await processPaystackEvent(payload, `notification-${fixture.reference}`);
      await processPaystackEvent(payload, `notification-replay-${fixture.reference}`);
      const jobs = await db.select().from(customerNotifications).where(eq(customerNotifications.orderId, fixture.orderId));
      expect(jobs).toHaveLength(1);
      return { db, fixture, job: jobs[0]! };
    }
    it('queues once without a browser return and sends permanent instructions, not a token', async () => {
      const { job } = await purchase();
      expect(send).not.toHaveBeenCalled();
      expect(await deliverCustomerNotifications(job.id)).toMatchObject({ sent: 1 });
      expect(send.mock.calls[0]![0]).toMatchObject({ to: [{ email: 'safe@example.test' }] });
      expect(send.mock.calls[0]![0].text).toContain('/account/sign-in');
      expect(generateLink).not.toHaveBeenCalled();
      expect(await deliverCustomerNotifications(job.id)).toMatchObject({ sent: 0 });
    });
    it('keeps failures due for a later retry and records success only after SES accepts', async () => {
      const { db, job } = await purchase();
      send.mockRejectedValueOnce(new Error('SES unavailable'));
      expect(await deliverCustomerNotifications(job.id)).toMatchObject({ failed: 1 });
      const [failed] = await db.select().from(customerNotifications).where(eq(customerNotifications.id, job.id));
      expect(failed).toMatchObject({ attempts: 1, sentAt: null, leaseUntil: null });
      expect(failed!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
      await db.update(customerNotifications).set({ nextAttemptAt: new Date(0) }).where(eq(customerNotifications.id, job.id));
      expect(await deliverCustomerNotifications(job.id)).toMatchObject({ sent: 1 });
    });
    it('claims concurrently without duplicate sends', async () => {
      const { job } = await purchase();
      const results = await Promise.all([deliverCustomerNotifications(job.id), deliverCustomerNotifications(job.id)]);
      expect(results.reduce((sum, result) => sum + result.sent, 0)).toBe(1);
      expect(send).toHaveBeenCalledOnce();
    });
    it('cancels an unsent notification after access is refunded', async () => {
      const { db, fixture, job } = await purchase();
      await db.update(orders).set({ status: 'refunded' }).where(eq(orders.id, fixture.orderId));
      expect(await deliverCustomerNotifications(job.id)).toMatchObject({ canceled: 1 });
      expect(send).not.toHaveBeenCalled();
    });
    it('coalesces login requests and generates fresh tokens only at delivery', async () => {
      const { job } = await purchase();
      const id = await queueCustomerLogin(job.clientId);
      expect(await queueCustomerLogin(job.clientId)).toBe(id);
      generateLink.mockResolvedValueOnce({ data: {}, error: new Error('Auth down') });
      expect(await deliverCustomerNotifications(id)).toMatchObject({ failed: 1 });
      await getDatabase().update(customerNotifications).set({ nextAttemptAt: new Date(0) }).where(eq(customerNotifications.id, id));
      expect(await deliverCustomerNotifications(id)).toMatchObject({ sent: 1 });
      expect(send.mock.calls[0]![0].text).toContain('token_hash=fixture-token');
      const [stored] = await getDatabase().select().from(customerNotifications).where(eq(customerNotifications.id, id));
      expect(JSON.stringify(stored)).not.toContain('fixture-token');
    });
    it('expires stale login work instead of generating unsolicited links forever', async () => {
      const { job } = await purchase();
      const id = await queueCustomerLogin(job.clientId);
      await getDatabase().update(customerNotifications).set({ createdAt: new Date(0) }).where(eq(customerNotifications.id, id));
      expect(await deliverCustomerNotifications(id)).toMatchObject({ canceled: 1 });
      expect(generateLink).not.toHaveBeenCalled();
    });
    it('fails closed without a safe test inbox and performs no work when disabled', async () => {
      const { job } = await purchase();
      vi.stubGlobal('useRuntimeConfig', () => ({ paystackEnvironment: 'test', accountBaseUrl: 'https://admin.example.test' }));
      expect(await runCustomerNotificationWorker()).toMatchObject({ disabled: true });
      expect(await deliverCustomerNotifications(job.id)).toMatchObject({ failed: 1 });
      expect(send).not.toHaveBeenCalled();
    });
    it('enforces database order/client ownership', async () => {
      const { db, fixture, job } = await purchase();
      const other = await seedPendingPayment(db);
      await expect(db.insert(customerNotifications).values({ clientId: job.clientId, orderId: other.orderId,
        kind: 'purchase', deduplicationKey: `invalid:${fixture.orderId}` })).rejects.toThrow();
    });
  });
}
