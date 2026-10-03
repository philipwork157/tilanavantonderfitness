import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Database } from '@tilana/db/server';
import { clients, customerNotifications, invoices, orderItems, orders, payments, programAccess, users } from '@tilana/db/schema';
import { eq } from 'drizzle-orm';
import { createManualClient, listClientsWithProgrammes, updateManualClient } from '@server/services/client-management';
import { getAdminDashboard } from '@server/services/admin-dashboard';
import { seedPendingPayment } from './paystack-database';

/** Real PostgreSQL regression coverage for profile edits and immutable manual sales. */
export function registerClientManagementCases(getDatabase: () => Database) {
  /** Local fixtures build genuine settled snapshots without contacting Paystack or sending mail. */
  async function recordedPurchase() {
    const db = getDatabase(); const purchase = await seedPendingPayment(db);
    const [order] = await db.select().from(orders).where(eq(orders.id, purchase.orderId));
    const paidAt = new Date();
    await db.transaction(async transaction => {
      await transaction.update(payments).set({ status: 'succeeded', paidAt }).where(eq(payments.id, purchase.paymentId));
      await transaction.update(orders).set({ status: 'paid', paidAt }).where(eq(orders.id, purchase.orderId));
    });
    return { db, purchase, clientId: order!.clientId };
  }
  async function fixture(status: 'paid' | 'pending') {
    const db = getDatabase();
    const seeded = await seedPendingPayment(db);
    const [item] = await db.select().from(orderItems).where(eq(orderItems.id, seeded.itemId));
    const uuid = randomUUID();
    await db.$client`insert into auth.users (id) values (${uuid})`;
    const [admin] = await db.insert(users).values({ supabaseId: uuid, firstName: 'Test', lastName: 'Admin', email: `${uuid}@example.test` }).returning();
    const input = { firstName: 'Manual', lastName: 'Buyer', email: `manual-${uuid}@example.test`, phone: '', gender: null, notes: '', purchaseStatus: status, programmes: [{ programVolumeId: item!.programVolumeId!, priceCents: 10000 }] };
    const client = await createManualClient(input, admin!.id);
    return { db, input, client, administratorId: admin!.id };
  }
  async function history(db: Database, clientId: number) {
    const [order] = await db.select().from(orders).where(eq(orders.clientId, clientId));
    return { order, items: await db.select().from(orderItems).where(eq(orderItems.orderId, order!.id)), payments: await db.select().from(payments).where(eq(payments.orderId, order!.id)), access: await db.select().from(programAccess).where(eq(programAccess.clientId, clientId)) };
  }
  describe('V1 recorded sales and purchased-program email visibility', () => {
    it('reports all purchase email states without rewriting settled history or using login jobs', async () => {
      const f = await recordedPurchase();
      const before = await history(f.db, f.clientId);
      const programme = async () => (await listClientsWithProgrammes('test', 'paystack'))
        .find(client => client.id === f.clientId)!.programmes[0]!;
      expect((await programme()).delivery).toMatchObject({ status: 'unavailable', attempts: 0, acceptedAt: null });
      const [job] = await f.db.insert(customerNotifications).values({ kind: 'purchase', clientId: f.clientId,
        orderId: f.purchase.orderId, deduplicationKey: `purchase:${f.purchase.orderId}` }).returning();
      expect((await programme()).delivery).toMatchObject({ status: 'pending', attempts: 0 });
      const nextAttemptAt = new Date(Date.now() + 60_000);
      await f.db.update(customerNotifications).set({ attempts: 2, nextAttemptAt }).where(eq(customerNotifications.id, job!.id));
      await f.db.insert(customerNotifications).values({ kind: 'login', clientId: f.clientId,
        deduplicationKey: `login-visibility:${f.clientId}`, sentAt: new Date() });
      expect((await programme()).delivery).toMatchObject({ status: 'retrying', attempts: 2, nextAttemptAt });
      const acceptedAt = new Date();
      await f.db.update(customerNotifications).set({ sentAt: acceptedAt }).where(eq(customerNotifications.id, job!.id));
      expect((await programme()).delivery).toMatchObject({ status: 'sent', acceptedAt, nextAttemptAt: null });
      await f.db.update(customerNotifications).set({ canceledAt: new Date() }).where(eq(customerNotifications.id, job!.id));
      expect((await programme()).delivery?.status).toBe('canceled');
      expect(await history(f.db, f.clientId)).toEqual(before);
      expect((await listClientsWithProgrammes('live', 'paystack')).some(client => client.id === f.clientId)).toBe(false);
      await f.db.transaction(async transaction => {
        await transaction.update(payments).set({ status: 'refunded', refundedAmountCents: 10000 }).where(eq(payments.id, f.purchase.paymentId));
        await transaction.update(orders).set({ status: 'refunded' }).where(eq(orders.id, f.purchase.orderId));
      });
      expect(await programme()).toMatchObject({ status: 'refunded', delivery: { status: 'canceled' } });
    });
    it('alerts once per paid order for retries, missing jobs and stuck first sends, without mixing manual/live sales', async () => {
      const baseline = (await getAdminDashboard('test', 30)).alerts.programEmailsNeedingAttention;
      const otherModeBaseline = (await getAdminDashboard('live', 30)).alerts.programEmailsNeedingAttention;
      const missing = await recordedPurchase();
      const retrying = await recordedPurchase();
      const stale = await recordedPurchase();
      const sent = await recordedPurchase();
      const canceled = await recordedPurchase();
      const recent = await recordedPurchase();
      await fixture('paid'); // Optional/manual history is not a Paystack delivery alert.
      for (const [f, state] of [[retrying, 'retrying'], [stale, 'stale'], [sent, 'sent'], [canceled, 'canceled'], [recent, 'recent']] as const) {
        await f.db.insert(customerNotifications).values({ kind: 'purchase', clientId: f.clientId,
          orderId: f.purchase.orderId, deduplicationKey: `purchase:${f.purchase.orderId}`,
          attempts: state === 'retrying' ? 1 : 0,
          sentAt: state === 'sent' ? new Date() : null, canceledAt: state === 'canceled' ? new Date() : null,
          createdAt: state === 'stale' ? new Date(Date.now() - 31 * 60_000) : new Date(),
        });
      }
      expect((await getAdminDashboard('test', 30)).alerts.programEmailsNeedingAttention).toBe(baseline + 3);
      expect((await getAdminDashboard('live', 30)).alerts.programEmailsNeedingAttention).toBe(otherModeBaseline);
      const [order] = await missing.db.select().from(orders).where(eq(orders.id, missing.purchase.orderId));
      expect(order?.status).toBe('paid');
    });
  });
  describe('Manual client historical integrity', () => {
    it('excludes manual, pending and other-mode orders from the Paystack-only view without deleting them', async () => {
      const f = await fixture('paid'); const checkout = await seedPendingPayment(f.db);
      const [checkoutOrder] = await f.db.select().from(orders).where(eq(orders.id, checkout.orderId));
      const buyerId = checkoutOrder!.clientId;
      expect((await listClientsWithProgrammes('test', 'paystack')).some(client => client.id === f.client.id)).toBe(false);
      expect((await listClientsWithProgrammes('test', 'all')).some(client => client.id === f.client.id)).toBe(true);
      const [payment] = await f.db.select().from(payments).where(eq(payments.id, checkout.paymentId));
      expect((await listClientsWithProgrammes('test', 'paystack')).some(client => client.id === buyerId)).toBe(false);
      await f.db.update(payments).set({ status: 'succeeded' }).where(eq(payments.id, payment!.id));
      const buyer = (await listClientsWithProgrammes('test', 'paystack')).find(client => client.id === buyerId);
      expect(buyer?.programmes).toHaveLength(1); expect(buyer?.programmes[0]?.payment?.id).toBe(payment!.id);
      expect((await listClientsWithProgrammes('live', 'paystack')).some(client => client.id === buyerId)).toBe(false);
      expect((await history(f.db, f.client.id)).payments).toHaveLength(1);
    });
    it('preserves every sale and access field during repeated paid profile edits', async () => {
      const f = await fixture('paid');
      const before = await history(f.db, f.client.id);
      for (const firstName of ['Updated', 'Updated again']) {
        await updateManualClient(f.client.id, { ...f.input, firstName, phone: '123', notes: 'Profile only' }, f.administratorId);
        expect(await history(f.db, f.client.id)).toEqual(before);
      }
      const [profile] = await f.db.select().from(clients).where(eq(clients.id, f.client.id));
      expect(profile).toMatchObject({ firstName: 'Updated again', phone: '123', notes: 'Profile only' });
    });
    it.each(['price', 'status', 'volume'])('rejects paid %s changes atomically', async (change) => {
      const f = await fixture('paid');
      const before = await history(f.db, f.client.id);
      const input = { ...f.input, firstName: 'Must roll back', programmes: [...f.input.programmes] };
      if (change === 'price') input.programmes = [{ ...input.programmes[0]!, priceCents: 9000 }];
      if (change === 'volume') input.programmes = [{ ...input.programmes[0]!, programVolumeId: 2147483647 }];
      if (change === 'status') input.purchaseStatus = 'pending';
      await expect(updateManualClient(f.client.id, input, f.administratorId)).rejects.toThrow('cannot be rewritten');
      expect(await history(f.db, f.client.id)).toEqual(before);
      const [profile] = await f.db.select().from(clients).where(eq(clients.id, f.client.id));
      expect(profile?.firstName).toBe('Manual');
    });
    it('settles a pristine pending manual reservation once and then preserves it', async () => {
      const f = await fixture('pending');
      const input = { ...f.input, purchaseStatus: 'paid' as const, programmes: [{ ...f.input.programmes[0]!, priceCents: 12000 }] };
      await updateManualClient(f.client.id, input, f.administratorId);
      const settled = await history(f.db, f.client.id);
      expect(settled.payments).toHaveLength(1);
      expect(settled.order).toMatchObject({ status: 'paid', totalCents: 12000 });
      await updateManualClient(f.client.id, { ...input, notes: 'New profile note' }, f.administratorId);
      expect(await history(f.db, f.client.id)).toEqual(settled);
    });
    it('does not delete failed payment attempts on a pending manual order', async () => {
      const f = await fixture('pending');
      const initial = await history(f.db, f.client.id);
      await f.db.insert(payments).values({ orderId: initial.order!.id, provider: 'manual', status: 'failed', amountCents: 10000, currency: 'ZAR' });
      const before = await history(f.db, f.client.id);
      await updateManualClient(f.client.id, { ...f.input, notes: 'Profile edit' }, f.administratorId);
      expect(await history(f.db, f.client.id)).toEqual(before);
      await expect(updateManualClient(f.client.id, { ...f.input, purchaseStatus: 'paid' }, f.administratorId)).rejects.toThrow('cannot be rewritten');
    });
    it('preserves invoice links and prevents rewriting an invoiced pending reservation', async () => {
      const f = await fixture('pending');
      const before = await history(f.db, f.client.id);
      const [invoice] = await f.db.insert(invoices).values({ invoiceNumber: `TEST-${randomUUID()}`, clientId: f.client.id, orderId: before.order!.id, sellerName: 'Test Seller', clientName: 'Original Buyer', clientEmail: f.input.email }).returning();
      await updateManualClient(f.client.id, { ...f.input, lastName: 'Updated' }, f.administratorId);
      expect(await history(f.db, f.client.id)).toEqual(before);
      expect((await f.db.select().from(invoices).where(eq(invoices.id, invoice!.id)))[0]).toEqual(invoice);
      await expect(updateManualClient(f.client.id, { ...f.input, purchaseStatus: 'paid' }, f.administratorId)).rejects.toThrow('cannot be rewritten');
    });
    it('serializes concurrent settlement and creates only one manual payment', async () => {
      const f = await fixture('pending');
      const input = { ...f.input, purchaseStatus: 'paid' as const };
      await Promise.all([updateManualClient(f.client.id, input, f.administratorId), updateManualClient(f.client.id, input, f.administratorId)]);
      const after = await history(f.db, f.client.id);
      expect(after.payments).toHaveLength(1);
      expect(after.items).toHaveLength(1);
      expect(after.access).toHaveLength(1);
    });
  });
}
