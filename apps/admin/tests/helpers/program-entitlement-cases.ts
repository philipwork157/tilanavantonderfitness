import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Database } from '@tilana/db/server';
import { orderItems, orders, payments, programAccess } from '@tilana/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { readFile } from 'node:fs/promises';
import { currentProgramAccess, grantPurchasedProgram } from '@server/services/program-entitlements';
import { processPaystackEvent } from '@server/services/paystack';
import { seedPendingPayment, type PaymentFixture } from './paystack-database';

/** Replay the reviewed repair SQL against old-style data in the fresh local DB only. */
export async function verifyEntitlementRepair(db: Database) {
  await db.execute(sql`CREATE UNIQUE INDEX program_access_client_volume_active_unique ON program_access(client_id, program_volume_id) WHERE status = 'active'`);
  const fixture = await seedPendingPayment(db);
  const [item] = await db.select().from(orderItems).where(eq(orderItems.id, fixture.itemId));
  await db.update(orders).set({ status: 'paid', paidAt: new Date() }).where(eq(orders.id, fixture.orderId));
  await db.update(payments).set({ status: 'succeeded', paidAt: new Date() }).where(eq(payments.id, fixture.paymentId));
  const [promotion] = await db.insert(programAccess).values({ clientId: item!.clientId, programVolumeId: item!.programVolumeId!, source: 'promotion', expiresAt: new Date(Date.now() + 60000) }).returning();
  const unpaid = await seedPendingPayment(db);
  const revoked = await seedPendingPayment(db);
  const [revokedItem] = await db.select().from(orderItems).where(eq(orderItems.id, revoked.itemId));
  await db.update(orders).set({ status: 'paid', paidAt: new Date() }).where(eq(orders.id, revoked.orderId));
  await db.update(payments).set({ status: 'succeeded', paidAt: new Date() }).where(eq(payments.id, revoked.paymentId));
  const [revokedGrant] = await db.insert(programAccess).values({ clientId: revokedItem!.clientId, programVolumeId: revokedItem!.programVolumeId!, orderItemId: revoked.itemId, source: 'purchase', status: 'revoked', revokedAt: new Date() }).returning();
  const mismatch = await seedPendingPayment(db);
  await db.update(orders).set({ status: 'paid', paidAt: new Date() }).where(eq(orders.id, mismatch.orderId));
  await db.update(payments).set({ status: 'succeeded', paidAt: new Date(), currency: 'USD' }).where(eq(payments.id, mismatch.paymentId));
  const migration = await readFile(new URL('../../../../supabase/migrations/20260918075403_superb_paper_doll.sql', import.meta.url), 'utf8');
  await db.transaction(async tx => {
    for (const statement of migration.split('--> statement-breakpoint')) await tx.execute(sql.raw(statement));
  });
  const rows = await db.select().from(programAccess).where(eq(programAccess.clientId, item!.clientId));
  expect(rows).toHaveLength(2);
  expect(rows.find(row => row.id === promotion!.id)).toEqual(promotion);
  expect(rows.find(row => row.orderItemId === fixture.itemId)).toMatchObject({ source: 'purchase', status: 'active', expiresAt: null });
  expect(await db.select().from(programAccess).where(eq(programAccess.orderItemId, unpaid.itemId))).toHaveLength(0);
  expect(await db.select().from(programAccess).where(eq(programAccess.orderItemId, mismatch.itemId))).toHaveLength(0);
  expect(await db.select().from(programAccess).where(eq(programAccess.orderItemId, revoked.itemId))).toEqual([revokedGrant]);
}

/** Real constraints and webhook transactions prove independent grant provenance. */
export function registerProgramEntitlementCases(getDatabase: () => Database) {
  async function line(fixture: PaymentFixture) {
    return (await getDatabase().select().from(orderItems).where(eq(orderItems.id, fixture.itemId)))[0]!;
  }
  async function charge(fixture: PaymentFixture) {
    await processPaystackEvent({ event: 'charge.success', data: { id: fixture.paymentId, reference: fixture.reference, amount: 10000, currency: 'ZAR', domain: 'test', status: 'success' } }, randomUUID());
  }
  async function refund(fixture: PaymentFixture, amount = 10000) {
    await processPaystackEvent({ event: 'refund.processed', data: { transaction_reference: fixture.reference, id: `access-${fixture.paymentId}`, amount, currency: 'ZAR', domain: 'test', status: 'processed' } }, randomUUID());
  }
  async function secondPurchase(first: PaymentFixture) {
    const db = getDatabase();
    const item = await line(first);
    const reference = `ACCESS-${randomUUID()}`;
    const [order] = await db.insert(orders).values({ orderNumber: reference, clientId: item.clientId, status: 'pending', subtotalCents: 10000, totalCents: 10000 }).returning();
    const [other] = await db.insert(orderItems).values({ orderId: order!.id, clientId: item.clientId, programVolumeId: item.programVolumeId, description: 'Same volume, independent purchase', unitPriceCents: 10000, lineTotalCents: 10000 }).returning();
    const [payment] = await db.insert(payments).values({ orderId: order!.id, provider: 'paystack', providerReference: reference, amountCents: 10000, currency: 'ZAR', environment: 'test' }).returning();
    return { reference, orderId: order!.id, itemId: other!.id, paymentId: payment!.id };
  }
  async function active(clientId: number, now = new Date()) {
    return getDatabase().select().from(programAccess).where(and(eq(programAccess.clientId, clientId), currentProgramAccess(now)));
  }

  describe('independent program entitlements against PostgreSQL', () => {
    it.each(['promotion', 'manual'] as const)('preserves a paid purchase after temporary %s access expires and refund preserves the other grant', async source => {
      const db = getDatabase();
      const fixture = await seedPendingPayment(db);
      const item = await line(fixture);
      const expiry = new Date(Date.now() + 60000);
      const [temporary] = await db.insert(programAccess).values({ clientId: item.clientId, programVolumeId: item.programVolumeId!, source, expiresAt: expiry }).returning();
      await Promise.all([charge(fixture), charge(fixture)]);
      expect(await active(item.clientId)).toHaveLength(2);
      expect(await active(item.clientId, expiry)).toMatchObject([{ orderItemId: item.id, source: 'purchase', expiresAt: null }]);
      await refund(fixture);
      expect(await active(item.clientId)).toEqual([temporary]);
    });

    it('enforces inclusive starts and exclusive expiry, including future and revoked grants', async () => {
      const db = getDatabase();
      const fixture = await seedPendingPayment(db);
      const item = await line(fixture);
      const start = new Date('2030-01-01T00:00:00Z');
      const expiry = new Date('2030-01-02T00:00:00Z');
      const [grant] = await db.insert(programAccess).values({ clientId: item.clientId, programVolumeId: item.programVolumeId!, source: 'promotion', startsAt: start, expiresAt: expiry }).returning();
      expect(await active(item.clientId, new Date(start.getTime() - 1))).toHaveLength(0);
      expect(await active(item.clientId, start)).toEqual([grant]);
      expect(await active(item.clientId, expiry)).toHaveLength(0);
      await db.update(programAccess).set({ status: 'revoked' }).where(eq(programAccess.id, grant!.id));
      expect(await active(item.clientId, start)).toHaveLength(0);
    });

    it('a future grant cannot prevent an immediate paid purchase', async () => {
      const db = getDatabase();
      const fixture = await seedPendingPayment(db);
      const item = await line(fixture);
      await db.insert(programAccess).values({ clientId: item.clientId, programVolumeId: item.programVolumeId!, source: 'manual', startsAt: new Date(Date.now() + 60000) });
      await charge(fixture);
      expect(await active(item.clientId)).toMatchObject([{ orderItemId: item.id, source: 'purchase' }]);
    });

    it('retains two concurrently paid purchases and revokes only the refunded order', async () => {
      const first = await seedPendingPayment(getDatabase());
      const second = await secondPurchase(first);
      const item = await line(first);
      await Promise.all([charge(first), charge(second)]);
      expect(await active(item.clientId)).toHaveLength(2);
      await Promise.all([refund(first), charge(second)]);
      expect(await active(item.clientId)).toMatchObject([{ orderItemId: second.itemId }]);
      await Promise.all([refund(first), refund(second)]);
      expect(await active(item.clientId)).toHaveLength(0);
    });

    it('keeps partial refunds active without resurrecting an explicitly revoked grant', async () => {
      const db = getDatabase();
      const fixture = await seedPendingPayment(db);
      const item = await line(fixture);
      await charge(fixture);
      await refund(fixture, 3000);
      expect(await active(item.clientId)).toHaveLength(1);
      await db.update(programAccess).set({ status: 'revoked', revokedAt: new Date() }).where(eq(programAccess.orderItemId, item.id));
      await db.transaction(tx => grantPurchasedProgram(tx, item));
      await charge(fixture);
      expect(await active(item.clientId)).toHaveLength(0);
      expect(await db.select().from(programAccess).where(eq(programAccess.orderItemId, item.id))).toHaveLength(1);
    });

    it('retains composite ownership constraints and ignores non-program lines', async () => {
      const db = getDatabase();
      const first = await seedPendingPayment(db);
      const second = await seedPendingPayment(db);
      const item = await line(first);
      const other = await line(second);
      await expect(db.transaction(tx => grantPurchasedProgram(tx, { ...item, clientId: other.clientId }))).rejects.toThrow();
      await db.transaction(tx => grantPurchasedProgram(tx, { ...item, programVolumeId: null }));
      expect(await active(item.clientId)).toHaveLength(0);
    });
  });
}
