import { randomUUID } from 'node:crypto';
import { describe, expect, it, type vi } from 'vitest';
import type { Database } from '@tilana/db/server';
import { clients, invoiceCommands, invoiceCredits, invoiceDeliveries, invoiceEditions, invoiceItems, invoicePurchaseReviews, invoices, orderItems, orders, payments, programAccess, users } from '@tilana/db/schema';
import { eq } from 'drizzle-orm';
import { createManualInvoice } from '@server/services/invoice-administration';
import { applyInvoiceAction } from '@server/services/invoice-actions';
import { approveInvoicePurchaseReview } from '@server/services/invoice-review';
import { reconcileOrderInvoice } from '@server/services/invoice-issuance';
import { getInvoiceDocument, listInvoices } from '@server/services/invoice-records';
import { seedPendingPayment } from './paystack-database';
import { inspectInvoice, inspectInvoicePurchase } from '@server/services/invoice-inspection';
import { linkVerifiedCustomerAccount } from '@server/utils/customer-auth';
import { createManualClient } from '@server/services/client-management';
import type { H3Event } from 'h3';

/** Exercise actual transactions, forward migrations, immutable evidence and provider boundaries. */
export function registerInvoiceAdministrationCases(getDatabase: () => Database, supabase: ReturnType<typeof vi.fn>) {
  const command = () => ({ idempotencyKey: randomUUID(), reason: 'Verified original bank and billing evidence' });
  async function fixture() {
    const db = getDatabase();
    const uuid = randomUUID();
    await db.$client`insert into auth.users (id) values (${uuid})`;
    const [actor] = await db.insert(users).values({ supabaseId: uuid, firstName: 'Admin', lastName: 'Fixture', email: `${uuid}@example.test` }).returning();
    const [client] = await db.insert(clients).values({ firstName: 'Original', lastName: 'Buyer', email: `buyer-${uuid}@example.test` }).returning();
    const input = { ...command(), clientId: client!.id, items: [{ description: 'Monthly coaching', quantity: 2, unitPriceCents: 5000 }] };
    const result = await createManualInvoice(input, actor!.id);
    return { db, actorId: actor!.id, clientId: client!.id, input, id: result.invoiceId!, orderId: result.orderId! };
  }
  async function paidFixture() {
    const f = await fixture();
    await applyInvoiceAction(f.id, { ...command(), action: 'issue' }, f.actorId);
    await applyInvoiceAction(f.id, { ...command(), action: 'record-payment', amountCents: 10000, reference: `receipt-${randomUUID()}`, paidAt: '2026-09-17T10:00:00Z' }, f.actorId);
    return f;
  }
  describe('Billing administration against PostgreSQL', () => {
    it('deduplicates concurrent draft creation and rejects changed actor or request retries', async () => {
      const f = await fixture();
      const results = await Promise.all([createManualInvoice(f.input, f.actorId), createManualInvoice(f.input, f.actorId)]);
      expect(results[0].invoiceId).toBe(f.id);
      expect(results[1]).toEqual(results[0]);
      expect(await f.db.select().from(invoices).where(eq(invoices.clientId, f.clientId))).toHaveLength(1);
      await expect(createManualInvoice({ ...f.input, reason: 'Changed payload' }, f.actorId)).rejects.toMatchObject({ statusCode: 409 });
      await expect(createManualInvoice(f.input, f.actorId + 1)).rejects.toMatchObject({ statusCode: 409 });
    });
    it('keeps draft documents private and does not grant access or record payment on issue', async () => {
      const f = await fixture();
      await expect(getInvoiceDocument(f.id, f.clientId)).rejects.toMatchObject({ statusCode: 404 });
      expect((await listInvoices(f.clientId)).invoices).toHaveLength(0);
      const action = { ...command(), action: 'issue' as const };
      await applyInvoiceAction(f.id, action, f.actorId);
      await applyInvoiceAction(f.id, action, f.actorId);
      expect((await getInvoiceDocument(f.id, f.clientId)).invoice.status).toBe('issued');
      expect(await f.db.select().from(payments).where(eq(payments.orderId, f.orderId))).toHaveLength(0);
      expect(await f.db.select().from(programAccess).where(eq(programAccess.clientId, f.clientId))).toHaveLength(0);
      expect(await f.db.select().from(invoiceDeliveries).where(eq(invoiceDeliveries.invoiceId, f.id))).toHaveLength(1);
    });
    it('records exactly one full receipt and leaves purchase snapshots and access untouched', async () => {
      const f = await fixture();
      await applyInvoiceAction(f.id, { ...command(), action: 'issue' }, f.actorId);
      const input = { ...command(), action: 'record-payment' as const, amountCents: 10000, reference: `receipt-${randomUUID()}`, paidAt: '2026-09-17T10:00:00Z' };
      const results = await Promise.all([applyInvoiceAction(f.id, input, f.actorId), applyInvoiceAction(f.id, input, f.actorId)]);
      expect(results[0]).toEqual(results[1]);
      expect(await f.db.select().from(payments).where(eq(payments.orderId, f.orderId))).toHaveLength(1);
      expect((await getInvoiceDocument(f.id, f.clientId)).invoice).toMatchObject({ status: 'paid', totalCents: 10000 });
      expect(await f.db.select().from(programAccess).where(eq(programAccess.clientId, f.clientId))).toHaveLength(0);
    });
    it.each(['wrong-total', 'future-date', 'draft-state'])('rejects %s manual receipts atomically', async kind => {
      const f = await fixture();
      if (kind !== 'draft-state') await applyInvoiceAction(f.id, { ...command(), action: 'issue' }, f.actorId);
      await expect(applyInvoiceAction(f.id, { ...command(), action: 'record-payment', amountCents: kind === 'wrong-total' ? 9000 : 10000, reference: randomUUID(), paidAt: kind === 'future-date' ? '2099-01-01T00:00:00Z' : '2026-09-17T10:00:00Z' }, f.actorId)).rejects.toHaveProperty('statusCode');
      expect(await f.db.select().from(payments).where(eq(payments.orderId, f.orderId))).toHaveLength(0);
    });
    it('keeps original invoice immutable and adds an independently owned corrected edition', async () => {
      const f = await paidFixture();
      const original = await getInvoiceDocument(f.id, f.clientId);
      const input = { ...command(), action: 'reissue' as const, clientName: 'Corrected Buyer', clientPhone: '123', clientAddress: 'Corrected address' };
      const result = await applyInvoiceAction(f.id, input, f.actorId);
      expect(await applyInvoiceAction(f.id, input, f.actorId)).toEqual(result);
      expect(await getInvoiceDocument(f.id, f.clientId)).toEqual(original);
      expect((await getInvoiceDocument(f.id, f.clientId, undefined, result.editionId!)).edition?.clientName).toBe('Corrected Buyer');
      await expect(getInvoiceDocument(f.id, f.clientId + 1, undefined, result.editionId!)).rejects.toMatchObject({ statusCode: 404 });
      await expect(f.db.update(invoiceEditions).set({ clientName: 'Overwrite' }).where(eq(invoiceEditions.id, result.editionId!))).rejects.toThrow();
      await expect(f.db.update(invoices).set({ clientName: 'Overwrite' }).where(eq(invoices.id, f.id))).rejects.toThrow();
      await expect(f.db.update(invoiceItems).set({ description: 'Overwrite' }).where(eq(invoiceItems.invoiceId, f.id))).rejects.toThrow();
    });
    it('voids only unpaid manual documents and links one replacement for the same client', async () => {
      const f = await fixture();
      await applyInvoiceAction(f.id, { ...command(), action: 'issue' }, f.actorId);
      await applyInvoiceAction(f.id, { ...command(), action: 'void' }, f.actorId);
      const delivery = await f.db.select().from(invoiceDeliveries).where(eq(invoiceDeliveries.invoiceId, f.id));
      expect(delivery[0]?.canceledAt).not.toBeNull();
      expect(delivery[0]?.sentAt).toBeNull();
      const result = await createManualInvoice({ ...f.input, ...command(), replacesInvoiceId: f.id }, f.actorId);
      expect((await getInvoiceDocument(result.invoiceId!)).invoice.replacesInvoiceId).toBe(f.id);
      await expect(createManualInvoice({ ...f.input, ...command(), replacesInvoiceId: f.id }, f.actorId)).rejects.toMatchObject({ statusCode: 409 });
      const paid = await paidFixture();
      await expect(applyInvoiceAction(paid.id, { ...command(), action: 'void' }, paid.actorId)).rejects.toMatchObject({ statusCode: 409 });
    });
    it('records confirmed partial/full manual refunds once, with traceable credits and overage rejection', async () => {
      const f = await paidFixture();
      const input = { ...command(), action: 'record-refund' as const, amountCents: 3000, reference: `refund-${randomUUID()}`, refundedAt: '2026-09-17T11:00:00Z' };
      await applyInvoiceAction(f.id, input, f.actorId);
      await applyInvoiceAction(f.id, input, f.actorId);
      await expect(applyInvoiceAction(f.id, { ...input, ...command(), amountCents: 8000 }, f.actorId)).rejects.toMatchObject({ statusCode: 409 });
      await applyInvoiceAction(f.id, { ...input, ...command(), amountCents: 7000, reference: randomUUID() }, f.actorId);
      const invoice = (await getInvoiceDocument(f.id, f.clientId)).invoice;
      expect(invoice).toMatchObject({ status: 'paid', totalCents: 10000 });
      const credits = await f.db.select().from(invoiceCredits).where(eq(invoiceCredits.invoiceId, f.id));
      expect(credits.map(credit => credit.amountCents)).toEqual([3000, 7000]);
      expect((await f.db.select().from(payments).where(eq(payments.id, invoice.settledPaymentId!)))[0]?.status).toBe('refunded');
    });
    it('never accepts manual payment/refund/void commands for Paystack invoices', async () => {
      const f = await fixture();
      const seed = await seedPendingPayment(f.db);
      const [order] = await f.db.select().from(orders).where(eq(orders.id, seed.orderId));
      await f.db.update(orders).set({ customerName: 'Provider Buyer', customerEmail: f.input.clientId + '@example.test', status: 'paid', paidAt: new Date() }).where(eq(orders.id, seed.orderId));
      await f.db.update(payments).set({ status: 'succeeded', paidAt: new Date() }).where(eq(payments.id, seed.paymentId));
      const id = (await reconcileOrderInvoice(seed.orderId))!;
      await expect(applyInvoiceAction(id, { ...command(), action: 'void' }, f.actorId)).rejects.toMatchObject({ statusCode: 409 });
      await expect(applyInvoiceAction(id, { ...command(), action: 'record-refund', amountCents: 1000, reference: randomUUID(), refundedAt: '2026-09-17T10:00:00Z' }, f.actorId)).rejects.toMatchObject({ statusCode: 409 });
      expect((await getInvoiceDocument(id, order!.clientId)).invoice.source).toBe('purchase');
    });
    it('uses approved legacy evidence without modifying the original order', async () => {
      const f = await fixture();
      const seed = await seedPendingPayment(f.db);
      await f.db.update(payments).set({ status: 'succeeded', paidAt: new Date() }).where(eq(payments.id, seed.paymentId));
      await f.db.update(orders).set({ status: 'paid', paidAt: new Date() }).where(eq(orders.id, seed.orderId));
      const [original] = await f.db.select().from(orders).where(eq(orders.id, seed.orderId));
      const input = { ...command(), paymentId: seed.paymentId, clientName: 'Evidence Buyer', clientEmail: 'original@example.test', clientPhone: '', clientAddress: '', evidence: 'Original checkout evidence reference 12345' };
      await approveInvoicePurchaseReview(seed.orderId, input, f.actorId);
      await approveInvoicePurchaseReview(seed.orderId, input, f.actorId);
      const id = (await reconcileOrderInvoice(seed.orderId))!;
      expect((await getInvoiceDocument(id)).invoice.clientName).toBe('Evidence Buyer');
      expect((await f.db.select().from(orders).where(eq(orders.id, seed.orderId)))[0]).toEqual(original);
      await expect(f.db.delete(invoicePurchaseReviews).where(eq(invoicePurchaseReviews.orderId, seed.orderId))).rejects.toThrow();
      expect(await f.db.select().from(invoiceCommands).where(eq(invoiceCommands.orderId, seed.orderId))).toHaveLength(1);
    });
    it('blocks unresolved extra settlements and approvals borrowing another order payment', async () => {
      const f = await fixture();
      const seed = await seedPendingPayment(f.db);
      const other = await seedPendingPayment(f.db);
      await f.db.update(payments).set({ status: 'succeeded', paidAt: new Date() }).where(eq(payments.id, seed.paymentId));
      await f.db.insert(payments).values({ orderId: seed.orderId, provider: 'manual', status: 'succeeded', amountCents: 10000, paidAt: new Date() });
      await f.db.insert(payments).values({ orderId: seed.orderId, provider: 'paystack', providerReference: `EXTRA-${randomUUID()}`, environment: 'test', status: 'succeeded', amountCents: 10000, paidAt: new Date() });
      const input = { ...command(), paymentId: seed.paymentId, clientName: 'Buyer', clientEmail: 'buyer@example.test', clientPhone: '', clientAddress: '', evidence: 'Original evidence reference 12345' };
      await expect(approveInvoicePurchaseReview(seed.orderId, input, f.actorId)).rejects.toMatchObject({ statusCode: 409 });
      await expect(approveInvoicePurchaseReview(seed.orderId, { ...input, ...command(), paymentId: other.paymentId }, f.actorId)).rejects.toMatchObject({ statusCode: 409 });
    });
    it('accepts reviewed allocation only after extra provider attempts have zero remaining balance', async () => {
      const f = await fixture();
      const seed = await seedPendingPayment(f.db);
      await f.db.update(payments).set({ status: 'succeeded', paidAt: new Date() }).where(eq(payments.id, seed.paymentId));
      await f.db.update(orders).set({ status: 'paid', paidAt: new Date() }).where(eq(orders.id, seed.orderId));
      await f.db.insert(payments).values({ orderId: seed.orderId, provider: 'paystack', providerReference: `RESOLVED-${randomUUID()}`, environment: 'test', status: 'refunded', amountCents: 10000, refundedAmountCents: 10000, paidAt: new Date() });
      await approveInvoicePurchaseReview(seed.orderId, { ...command(), paymentId: seed.paymentId, clientName: 'Verified Buyer', clientEmail: 'buyer@example.test', clientPhone: '', evidence: 'Provider refund confirmation and original receipt references' }, f.actorId);
      const id = (await reconcileOrderInvoice(seed.orderId))!;
      expect((await getInvoiceDocument(id)).invoice.settledPaymentId).toBe(seed.paymentId);
      expect((await getInvoiceDocument(id)).invoice.totalCents).toBe(10000);
    });
    it('lets an issued-but-unpaid coaching customer link a billing identity without programme access', async () => {
      const f = await fixture();
      await applyInvoiceAction(f.id, { ...command(), action: 'issue' }, f.actorId);
      const uuid = randomUUID();
      await f.db.$client`insert into auth.users (id) values (${uuid})`;
      const [client] = await f.db.select().from(clients).where(eq(clients.id, f.clientId));
      supabase.mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: uuid, email: client!.email, email_confirmed_at: new Date().toISOString() } }, error: null }) } });
      expect(await linkVerifiedCustomerAccount({} as H3Event)).toMatchObject({ clientId: f.clientId });
      expect(await f.db.select().from(programAccess).where(eq(programAccess.clientId, f.clientId))).toHaveLength(0);
    });
    it('exposes safe admin inspection without checkout secrets and enforces evidence immutability', async () => {
      const f = await paidFixture();
      const detail = await inspectInvoice(f.id);
      expect(detail.commands).toHaveLength(3);
      expect(detail.payments[0]).not.toHaveProperty('accessCode');
      expect(detail.payments[0]).not.toHaveProperty('gatewayResponse');
      expect((await inspectInvoicePurchase(f.orderId)).items).toHaveLength(1);
      await expect(inspectInvoicePurchase(2147483647)).rejects.toMatchObject({ statusCode: 404 });
      await expect(f.db.update(payments).set({ amountCents: 9000 }).where(eq(payments.orderId, f.orderId))).rejects.toThrow();
      await expect(f.db.update(orders).set({ customerName: 'Rewrite' }).where(eq(orders.id, f.orderId))).rejects.toThrow();
      await expect(f.db.delete(invoiceCommands).where(eq(invoiceCommands.invoiceId, f.id))).rejects.toThrow();
      const other = await paidFixture();
      const editions = await f.db.select().from(invoiceEditions).where(eq(invoiceEditions.invoiceId, f.id));
      await expect(getInvoiceDocument(other.id, other.clientId, undefined, editions[0]!.id)).rejects.toMatchObject({ statusCode: 404 });
      await expect(f.db.insert(invoiceDeliveries).values({ invoiceId: other.id, editionId: editions[0]!.id })).rejects.toThrow();
    });
    it('invoices an existing recorded manual programme purchase without another sale or access grant', async () => {
      const f = await fixture();
      const seed = await seedPendingPayment(f.db);
      const [item] = await f.db.select().from(orderItems).where(eq(orderItems.id, seed.itemId));
      const client = await createManualClient({ firstName: 'Manual', lastName: 'Buyer', email: `existing-${randomUUID()}@example.test`, phone: '123', gender: null, notes: '', purchaseStatus: 'paid', programmes: [{ programVolumeId: item!.programVolumeId!, priceCents: 10000 }] }, f.actorId);
      const [order] = await f.db.select().from(orders).where(eq(orders.clientId, client.id));
      const access = await f.db.select().from(programAccess).where(eq(programAccess.clientId, client.id));
      const input = { ...command(), clientId: client.id, existingOrderId: order!.id, items: [] };
      const result = await createManualInvoice(input, f.actorId);
      expect(result.orderId).toBe(order!.id);
      expect(await f.db.select().from(orders).where(eq(orders.clientId, client.id))).toHaveLength(1);
      expect(await f.db.select().from(payments).where(eq(payments.orderId, order!.id))).toHaveLength(1);
      expect(await f.db.select().from(programAccess).where(eq(programAccess.clientId, client.id))).toEqual(access);
      expect((await getInvoiceDocument(result.invoiceId!)).invoice).toMatchObject({ clientName: 'Manual Buyer', status: 'paid' });
      const [otherOrder] = await f.db.insert(orders).values({ orderNumber: `MAN-OTHER-${randomUUID()}`, clientId: client.id, status: 'paid', subtotalCents: 10000, totalCents: 10000, paidAt: new Date() }).returning();
      const [otherItem] = await f.db.insert(orderItems).values({ orderId: otherOrder!.id, clientId: client.id, programVolumeId: item!.programVolumeId,
        description: 'Independently paid same volume', quantity: 1, unitPriceCents: 10000, lineTotalCents: 10000 }).returning();
      await f.db.insert(payments).values({ orderId: otherOrder!.id, provider: 'manual', status: 'succeeded', amountCents: 10000, paidAt: new Date() });
      await applyInvoiceAction(result.invoiceId!, { ...command(), action: 'record-refund', amountCents: 10000, reference: randomUUID(), refundedAt: new Date().toISOString() }, f.actorId);
      const afterAccess = await f.db.select().from(programAccess).where(eq(programAccess.clientId, client.id));
      expect(afterAccess.find(grant => grant.id === access[0]!.id)?.status).toBe('revoked');
      expect(afterAccess.filter(grant => grant.status === 'active')).toMatchObject([{ orderItemId: otherItem!.id }]);
      expect((await getInvoiceDocument(result.invoiceId!, client.id)).invoice.status).toBe('paid');
    });
    it('links a paid financial replacement only after the original has full confirmed credit', async () => {
      const f = await paidFixture();
      await expect(createManualInvoice({ ...f.input, ...command(), replacesInvoiceId: f.id }, f.actorId)).rejects.toMatchObject({ statusCode: 409 });
      await applyInvoiceAction(f.id, { ...command(), action: 'record-refund', amountCents: 10000, reference: randomUUID(), refundedAt: '2026-09-17T11:00:00Z' }, f.actorId);
      const replacement = await createManualInvoice({ ...f.input, ...command(), replacesInvoiceId: f.id }, f.actorId);
      expect((await getInvoiceDocument(replacement.invoiceId!)).invoice.replacesInvoiceId).toBe(f.id);
      expect((await getInvoiceDocument(f.id)).invoice.status).toBe('paid');
    });
  });
}
