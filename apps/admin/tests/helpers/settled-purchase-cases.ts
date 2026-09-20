import { describe, expect, it } from 'vitest';
import type { Database } from '@tilana/db/server';
import { invoiceItems, invoices, orderItems, orders, payments } from '@tilana/db/schema';
import { eq } from 'drizzle-orm';
import { processPaystackEvent } from '@server/services/paystack';
import { reconcileOrderInvoice } from '@server/services/invoice-issuance';
import { createBarrier, seedPendingPayment } from './paystack-database';

/** Exercise settlement without any invoice worker or invoice rows. */
export function registerSettledPurchaseCases(getDatabase: () => Database) {
  async function fixture() {
    const db = getDatabase();
    const f = await seedPendingPayment(db);
    const settle = () => processPaystackEvent({ event: 'charge.success', data: {
      id: f.paymentId, reference: f.reference, amount: 10000, currency: 'ZAR',
      domain: 'test', status: 'success', paid_at: '2026-09-20T00:00:00Z',
    } }, `settled-${f.reference}`);
    return { ...f, db, settle };
  }
  describe('Settled purchase database boundaries', () => {
    it.each(['draft', 'issued'])('protects paid lines with a %s invoice as well', async state => {
      const f = await fixture();
      await f.db.update(orders).set({ customerName: 'Original Buyer', customerEmail: 'buyer@example.test' }).where(eq(orders.id, f.orderId));
      await f.settle();
      if (state === 'issued') await reconcileOrderInvoice(f.orderId);
      else {
        const [order] = await f.db.select().from(orders).where(eq(orders.id, f.orderId));
        await f.db.transaction(async tx => {
          const [invoice] = await tx.insert(invoices).values({ invoiceNumber: `draft-${f.reference}`, managed: 1, orderId: f.orderId,
            subtotalCents: 10000, totalCents: 10000,
            clientId: order!.clientId, sellerName: 'Fixture Seller', clientName: 'Original Buyer', clientEmail: 'buyer@example.test' }).returning();
          await tx.insert(invoiceItems).values({ invoiceId: invoice!.id, description: 'Original purchase', unitPriceCents: 10000, lineTotalCents: 10000 });
        });
      }
      await expect(f.db.update(orderItems).set({ description: 'Changed' }).where(eq(orderItems.id, f.itemId))).rejects.toThrow();
      await expect(f.db.delete(orderItems).where(eq(orderItems.id, f.itemId))).rejects.toThrow();
    });
    it('rejects order and payment snapshot edits before an invoice exists', async () => {
      const f = await fixture();
      await f.settle();
      for (const change of [{ customerName: 'Changed' }, { currency: 'USD' }, { subtotalCents: 12000, totalCents: 12000 }, { paidAt: null }, { status: 'pending' as const }]) {
        await expect(f.db.update(orders).set(change).where(eq(orders.id, f.orderId))).rejects.toThrow();
      }
      for (const change of [{ amountCents: 12000 }, { currency: 'USD' }, { providerReference: 'Changed-reference' }, { paidAt: null }, { status: 'pending' as const }]) {
        await expect(f.db.update(payments).set(change).where(eq(payments.id, f.paymentId))).rejects.toThrow();
      }
      await expect(f.db.delete(payments).where(eq(payments.id, f.paymentId))).rejects.toThrow();
    });
    it('rejects line edits, deletion, insertion and moves into or out of a settled order', async () => {
      const f = await fixture();
      const [line] = await f.db.select().from(orderItems).where(eq(orderItems.id, f.itemId));
      const [draft] = await f.db.insert(orders).values({ clientId: line!.clientId, orderNumber: `draft-${f.reference}` }).returning();
      const [extra] = await f.db.insert(orderItems).values({ orderId: draft!.id, clientId: line!.clientId, description: 'Other', unitPriceCents: 1, lineTotalCents: 1 }).returning();
      await f.settle();
      await expect(f.db.update(orderItems).set({ description: 'Changed' }).where(eq(orderItems.id, f.itemId))).rejects.toThrow();
      await expect(f.db.delete(orderItems).where(eq(orderItems.id, f.itemId))).rejects.toThrow();
      await expect(f.db.insert(orderItems).values({ orderId: f.orderId, clientId: line!.clientId, description: 'Extra', unitPriceCents: 1, lineTotalCents: 1 })).rejects.toThrow();
      await expect(f.db.update(orderItems).set({ orderId: draft!.id }).where(eq(orderItems.id, f.itemId))).rejects.toThrow();
      await expect(f.db.update(orderItems).set({ orderId: f.orderId }).where(eq(orderItems.id, extra!.id))).rejects.toThrow();
    });
    it.each(['lines', 'amount', 'currency'])('rejects %s mismatch atomically at settlement', async (kind) => {
      const f = await fixture();
      if (kind === 'lines') await f.db.update(orderItems).set({ unitPriceCents: 9000, lineTotalCents: 9000 }).where(eq(orderItems.id, f.itemId));
      if (kind === 'amount') await f.db.update(orders).set({ subtotalCents: 10000, discountCents: 1000, totalCents: 9000 }).where(eq(orders.id, f.orderId));
      if (kind === 'currency') await f.db.update(orders).set({ currency: 'USD' }).where(eq(orders.id, f.orderId));
      await expect(f.settle()).rejects.toThrow();
      const [payment] = await f.db.select().from(payments).where(eq(payments.id, f.paymentId));
      expect(payment!.status).toBe('pending');
    });
    it('serializes a line mutation against concurrent settlement', async () => {
      const f = await fixture();
      const locked = createBarrier();
      const release = createBarrier();
      const mutation = f.db.transaction(async tx => {
        await tx.update(orderItems).set({ unitPriceCents: 9000, lineTotalCents: 9000 }).where(eq(orderItems.id, f.itemId));
        locked.resolve();
        await release.promise;
      });
      await locked.promise;
      const settlement = expect(f.settle()).rejects.toThrow();
      release.resolve();
      await mutation;
      await settlement;
    });
  });
}
