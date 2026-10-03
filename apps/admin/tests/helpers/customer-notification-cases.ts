import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { Database } from '@tilana/db/server';
import { customerNotifications, orders, orderItems, programFiles, programAccess, programVolumes, payments } from '@tilana/db/schema';
import { eq } from 'drizzle-orm';
import { processPaystackEvent } from '@server/services/paystack';
import { deliverCustomerNotifications, queueCustomerLogin, runCustomerNotificationWorker } from '@server/services/customer-notifications';
import { getPurchaseProgramAttachments } from '@server/services/purchase-program-attachments';
import { seedPendingPayment, type PaymentFixture } from './paystack-database';

/** Real migrated outbox tests, with SES and Supabase kept strictly mocked. */
export function registerCustomerNotificationCases(getDatabase: () => Database, send: Mock, generateLink: Mock) {
  describe('durable customer access notifications', () => {
    beforeEach(() => {
      vi.stubGlobal('useRuntimeConfig', () => ({ paystackSecretKey: 'sk_test_fixture', paystackEnvironment: 'test', accountBaseUrl: 'https://admin.example.test',
        emailDevelopmentEnabled: true, emailDevelopmentRecipient: 'safe@example.test', customerNotificationsEnabled: false, r2PrivateProgramBucket: 'private-test' }));
      send.mockResolvedValue({ messageId: 'fixture' });
      generateLink.mockResolvedValue({ data: { properties: { hashed_token: 'fixture-token' } }, error: null });
    });
    async function purchase(prepare?: (db: Database, fixture: PaymentFixture) => Promise<void>) {
      const db = getDatabase();
      const fixture = await seedPendingPayment(db);
      const [item] = await db.select().from(orderItems).where(eq(orderItems.id, fixture.itemId));
      await db.insert(programFiles).values({ programVolumeId: item!.programVolumeId!, displayName: 'Purchased program',
        originalFilename: 'Purchased.pdf', r2Bucket: 'private-test', r2ObjectKey: `${fixture.reference}.pdf`,
        uploadStatus: 'ready', sizeBytes: 20 });
      await prepare?.(db, fixture);
      const [order] = await db.select().from(orders).where(eq(orders.id, fixture.orderId));
      const payload = { event: 'charge.success', data: { id: fixture.paymentId, reference: fixture.reference,
        amount: order!.totalCents, currency: 'ZAR', domain: 'test', status: 'success' } };
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
      expect(send.mock.calls[0]![0].attachments).toHaveLength(1);
      expect(send.mock.calls[0]![0].text).toContain('PDFs attached');
      expect(generateLink).not.toHaveBeenCalled();
      expect(await deliverCustomerNotifications(job.id)).toMatchObject({ sent: 0 });
    });
    it('attaches both purchased volumes from a basket, never another customer grant', async () => {
      const { job } = await purchase(async (db, fixture) => {
        const [item] = await db.select().from(orderItems).where(eq(orderItems.id, fixture.itemId));
        const [firstVolume] = await db.select().from(programVolumes).where(eq(programVolumes.id, item!.programVolumeId!));
        const [secondVolume] = await db.insert(programVolumes).values({ programId: firstVolume!.programId,
          volumeNumber: 2, name: 'Second volume', currentPriceCents: 5000 }).returning();
        await db.insert(orderItems).values({ orderId: fixture.orderId, clientId: item!.clientId, programVolumeId: secondVolume!.id,
          description: 'Second volume', unitPriceCents: 5000, lineTotalCents: 5000 });
        await db.update(orders).set({ subtotalCents: 15000, totalCents: 15000 }).where(eq(orders.id, fixture.orderId));
        await db.update(payments).set({ amountCents: 15000 }).where(eq(payments.id, fixture.paymentId));
        await db.insert(programFiles).values({ programVolumeId: secondVolume!.id, displayName: 'Second PDF', r2Bucket: 'private-test',
          r2ObjectKey: `${fixture.reference}-second.pdf`, uploadStatus: 'ready', sizeBytes: 20 });
      });
      const other = await purchase();
      expect(await getPurchaseProgramAttachments(job.orderId!, other.job.clientId, new AbortController().signal)).toBeNull();
      expect(await deliverCustomerNotifications(job.id)).toMatchObject({ sent: 1 });
      expect(send.mock.calls[0]![0].attachments).toHaveLength(2);
    });
    it.each(['future', 'expired'] as const)('does not email PDFs for a %s purchase grant', async mode => {
      const { db, fixture, job } = await purchase();
      await db.update(programAccess).set(mode === 'future' ? { startsAt: new Date(Date.now() + 60000) }
        : { startsAt: new Date(0), expiresAt: new Date(1) }).where(eq(programAccess.orderItemId, fixture.itemId));
      expect(await deliverCustomerNotifications(job.id)).toMatchObject({ canceled: 1 });
      expect(send).not.toHaveBeenCalled();
    });
    it('never reads another environment bucket for an otherwise paid purchase', async () => {
      const { job } = await purchase();
      vi.stubGlobal('useRuntimeConfig', () => ({ paystackEnvironment: 'test', accountBaseUrl: 'https://admin.example.test', r2PrivateProgramBucket: 'private-live' }));
      expect(await deliverCustomerNotifications(job.id)).toMatchObject({ failed: 1 });
      expect(send).not.toHaveBeenCalled();
    });
    it('sends oversized baskets as explicit portal-only instructions', async () => {
      const { db, fixture, job } = await purchase();
      const [item] = await db.select().from(orderItems).where(eq(orderItems.id, fixture.itemId));
      await db.update(programFiles).set({ sizeBytes: 16 * 1024 * 1024 }).where(eq(programFiles.programVolumeId, item!.programVolumeId!));
      expect(await deliverCustomerNotifications(job.id)).toMatchObject({ sent: 1 });
      expect(send.mock.calls[0]![0].attachments).toEqual([]);
      expect(send.mock.calls[0]![0].text).toContain('too large to attach');
    });
    it('delivers automatically after committed payment when enabled and never sends on replay', async () => {
      vi.stubGlobal('useRuntimeConfig', () => ({ paystackSecretKey: 'sk_test_fixture', paystackEnvironment: 'test', accountBaseUrl: 'https://admin.example.test',
        emailDevelopmentEnabled: true, emailDevelopmentRecipient: 'safe@example.test', customerNotificationsEnabled: true, r2PrivateProgramBucket: 'private-test' }));
      const { db, fixture, job } = await purchase();
      expect(send).toHaveBeenCalledOnce();
      expect(job.sentAt).not.toBeNull();
      const [order] = await db.select().from(orders).where(eq(orders.id, fixture.orderId));
      expect(order!.status).toBe('paid');
      expect(send.mock.calls[0]![0].attachments).toHaveLength(1);
    });
    it('does not attach unrelated customer files or revoked purchase grants', async () => {
      const { db, fixture, job } = await purchase();
      const other = await purchase();
      await deliverCustomerNotifications(job.id);
      expect(send.mock.calls[0]![0].attachments).toHaveLength(1);
      await db.update(programAccess).set({ status: 'revoked', revokedAt: new Date() }).where(eq(programAccess.orderItemId, other.fixture.itemId));
      expect(await deliverCustomerNotifications(other.job.id)).toMatchObject({ canceled: 1 });
      expect(send).toHaveBeenCalledOnce();
      expect(fixture.orderId).not.toBe(other.fixture.orderId);
    });
    it('queues failed immediate sends without undoing successful payment', async () => {
      vi.stubGlobal('useRuntimeConfig', () => ({ paystackSecretKey: 'sk_test_fixture', paystackEnvironment: 'test', accountBaseUrl: 'https://admin.example.test',
        emailDevelopmentEnabled: true, emailDevelopmentRecipient: 'safe@example.test', customerNotificationsEnabled: true, r2PrivateProgramBucket: 'private-test' }));
      send.mockRejectedValueOnce(new Error('SES unavailable'));
      const { db, fixture, job } = await purchase();
      expect(job).toMatchObject({ sentAt: null, attempts: 1 });
      expect((await db.select().from(orders).where(eq(orders.id, fixture.orderId)))[0]?.status).toBe('paid');
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
      expect(send.mock.calls[0]![0].attachments).toBeUndefined();
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
