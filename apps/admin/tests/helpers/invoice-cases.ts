import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '@tilana/db/server';
import { clients, invoiceCredits, invoiceDeliveries, invoiceItems, invoices, orders, orderItems, payments, paymentRefunds, programVolumes, invoiceProcessingJobs } from '@tilana/db/schema';
import { eq, sql } from 'drizzle-orm';
import { seedPendingPayment, createBarrier } from './paystack-database';
import { reconcileOrderInvoice, reconcilePurchaseInvoices } from '@server/services/invoice-issuance';
import { getInvoiceDocument, listInvoices, retryInvoiceDelivery } from '@server/services/invoice-records';
import { deliverInvoices } from '@server/services/invoice-delivery';
import { linkVerifiedCustomerAccount, requireCustomer } from '@server/utils/customer-auth';
import { randomUUID } from 'node:crypto';

/** Real migrations/constraints, local provider-free fixtures and mocked SES only. */
export function registerInvoiceCases(getDatabase: () => Database, send: ReturnType<typeof vi.fn>, supabase: ReturnType<typeof vi.fn>) {
  describe('purchase invoice lifecycle against PostgreSQL', () => {
    beforeEach(() => {
      vi.stubGlobal('useRuntimeConfig', () => ({ paystackEnvironment: 'test', emailDevelopmentEnabled: true, emailDevelopmentRecipient: 'safe@example.test', accountBaseUrl: 'http://127.0.0.1:3001' }));
      send.mockResolvedValue({ messageId: 'fixture-only' });
    });
    const seed = async (options: { secondLine?: boolean; missingName?: boolean } = {}) => {
      const database = getDatabase();
      const fixture = await seedPendingPayment(database);
      const [order] = await database.select().from(orders).where(eq(orders.id, fixture.orderId));
      const [client] = await database.select().from(clients).where(eq(clients.id, order!.clientId));
      if (options.secondLine) await database.insert(orderItems).values({ orderId: fixture.orderId, clientId: client!.id, description: 'Second volume', unitPriceCents: 5000, lineTotalCents: 5000 });
      const totalCents = options.secondLine ? 15000 : 10000;
      await database.update(orders).set({ subtotalCents: totalCents, totalCents, customerName: options.missingName ? null : 'Original Buyer', customerEmail: client!.email, customerPhone: '0123456789', status: 'paid', paidAt: new Date() }).where(eq(orders.id, order!.id));
      await database.update(payments).set({ amountCents: totalCents, status: 'succeeded', paidAt: new Date(), verifiedAt: new Date() }).where(eq(payments.id, fixture.paymentId));
      return { ...fixture, clientId: client!.id };
    };
    it('issues one paid invoice with two original lines under concurrent replay', async () => {
      const database = getDatabase();
      const fixture = await seed({ secondLine: true });
      const ids = await Promise.all([reconcileOrderInvoice(fixture.orderId), reconcileOrderInvoice(fixture.orderId)]);
      expect(ids[0]).toBe(ids[1]);
      const document = await getInvoiceDocument(ids[0]!, fixture.clientId);
      expect(document.invoice).toMatchObject({ status: 'paid', totalCents: 15000, taxCents: 0, clientName: 'Original Buyer', settledPaymentId: fixture.paymentId });
      expect(document.items).toHaveLength(2);
      expect((await database.select().from(invoiceDeliveries).where(eq(invoiceDeliveries.invoiceId, ids[0]!)))).toHaveLength(1);
      const volumeId = document.items[0]!.programVolumeId!;
      await database.update(programVolumes).set({ currentPriceCents: 99999, name: 'Changed catalogue' }).where(eq(programVolumes.id, volumeId));
      await database.update(clients).set({ firstName: 'Changed profile' }).where(eq(clients.id, fixture.clientId));
      expect((await getInvoiceDocument(ids[0]!, fixture.clientId)).items).toEqual(document.items);
      await expect(database.update(invoices).set({ clientName: 'Changed history' }).where(eq(invoices.id, ids[0]!))).rejects.toMatchObject({ cause: { message: expect.stringContaining('immutable') } });
      await expect(database.update(invoiceItems).set({ description: 'Changed history' }).where(eq(invoiceItems.invoiceId, ids[0]!))).rejects.toMatchObject({ cause: { message: expect.stringContaining('immutable') } });
    });
    it('does not issue from pending, failed or unpaid reversed attempts', async () => {
      const fixture = await seedPendingPayment(getDatabase());
      expect(await reconcileOrderInvoice(fixture.orderId)).toBeNull();
      await getDatabase().update(payments).set({ status: 'reversed' }).where(eq(payments.id, fixture.paymentId));
      expect(await reconcileOrderInvoice(fixture.orderId)).toBeNull();
    });
    it('rejects missing original buyer data and multiple settled attempts', async () => {
      const database = getDatabase();
      const missing = await seed({ missingName: true });
      await expect(reconcileOrderInvoice(missing.orderId)).rejects.toThrow('snapshot');
      const fixture = await seed();
      await database.insert(payments).values({ orderId: fixture.orderId, provider: 'paystack', providerReference: `second-${fixture.reference}`, environment: 'test', amountCents: 10000, status: 'succeeded', paidAt: new Date() });
      await expect(reconcileOrderInvoice(fixture.orderId)).rejects.toThrow('Multiple settled');
    });
    it('records partial/full refund credit notes once without rewriting the invoice', async () => {
      const database = getDatabase();
      const fixture = await seed();
      const id = (await reconcileOrderInvoice(fixture.orderId))!;
      const original = await getInvoiceDocument(id);
      for (const amount of [3000, 7000]) {
        await database.insert(paymentRefunds).values({ paymentId: fixture.paymentId, status: 'processed', amountCents: amount, refundedAt: new Date() });
        await reconcileOrderInvoice(fixture.orderId);
        await reconcileOrderInvoice(fixture.orderId);
      }
      const credits = await database.select().from(invoiceCredits).where(eq(invoiceCredits.invoiceId, id));
      expect(credits.map(credit => credit.amountCents)).toEqual([3000, 7000]);
      expect((await getInvoiceDocument(id)).invoice.totalCents).toBe(original.invoice.totalCents);
      await expect(database.update(invoiceCredits).set({ amountCents: 1 }).where(eq(invoiceCredits.id, credits[0]!.id))).rejects.toMatchObject({ cause: { message: expect.stringContaining('immutable') } });
      const summary = (await listInvoices(fixture.clientId)).invoices[0]!;
      expect(summary.creditedCents).toBe(10000);
    });
    it('finds uncredited refund evidence even when payment timestamps precede invoice reconciliation', async () => {
      const database = getDatabase();
      const fixture = await seed();
      const id = (await reconcileOrderInvoice(fixture.orderId))!;
      await database.update(payments).set({ updatedAt: new Date('2000-01-01T00:00:00Z') }).where(eq(payments.id, fixture.paymentId));
      await database.insert(paymentRefunds).values({ paymentId: fixture.paymentId, status: 'processed', amountCents: 3000 });
      for (let index = 0; index < 4; index++) {
        await reconcilePurchaseInvoices();
        const credits = await database.select().from(invoiceCredits).where(eq(invoiceCredits.invoiceId, id));
        if (credits.length) break;
      }
      expect(await database.select().from(invoiceCredits).where(eq(invoiceCredits.invoiceId, id))).toMatchObject([{ amountCents: 3000 }]);
    });
    it('credits only the remaining balance on reversal and does not double-credit later refunds', async () => {
      const database = getDatabase();
      const fixture = await seed();
      const id = (await reconcileOrderInvoice(fixture.orderId))!;
      await database.insert(paymentRefunds).values({ paymentId: fixture.paymentId, status: 'processed', amountCents: 3000 });
      await reconcileOrderInvoice(fixture.orderId);
      await database.update(payments).set({ status: 'reversed', updatedAt: new Date() }).where(eq(payments.id, fixture.paymentId));
      await reconcileOrderInvoice(fixture.orderId);
      await database.insert(paymentRefunds).values({ paymentId: fixture.paymentId, status: 'processed', amountCents: 7000 });
      await reconcileOrderInvoice(fixture.orderId);
      const credits = await database.select().from(invoiceCredits).where(eq(invoiceCredits.invoiceId, id));
      expect(credits.map(credit => [credit.reason, credit.amountCents])).toEqual([['refund', 3000], ['reversal', 7000]]);
    });
    it('enforces customer ownership and credit association with non-enumerating 404s', async () => {
      const first = await seed();
      const second = await seed();
      const id = (await reconcileOrderInvoice(first.orderId))!;
      await expect(getInvoiceDocument(id, second.clientId)).rejects.toMatchObject({ statusCode: 404 });
      await expect(getInvoiceDocument(id, first.clientId, 2147483647)).rejects.toMatchObject({ statusCode: 404 });
      expect((await listInvoices(second.clientId)).invoices).toHaveLength(0);
    });
    it('allows a fully refunded buyer to link and read billing without granting program access', async () => {
      const database = getDatabase();
      const fixture = await seed();
      const invoiceId = (await reconcileOrderInvoice(fixture.orderId))!;
      const [client] = await database.select().from(clients).where(eq(clients.id, fixture.clientId));
      const id = randomUUID();
      await database.$client`insert into auth.users (id) values (${id})`;
      await database.update(orders).set({ status: 'refunded' }).where(eq(orders.id, fixture.orderId));
      supabase.mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id, email: client!.email, email_confirmed_at: new Date().toISOString() } }, error: null }) } });
      await linkVerifiedCustomerAccount({} as never);
      const customer = await requireCustomer({} as never);
      expect((await getInvoiceDocument(invoiceId, customer.clientId)).invoice.id).toBe(invoiceId);
    });
    it('does not treat an unpaid reversed order as eligible purchase history', async () => {
      const database = getDatabase();
      const fixture = await seedPendingPayment(database);
      const [order] = await database.select().from(orders).where(eq(orders.id, fixture.orderId));
      const [client] = await database.select().from(clients).where(eq(clients.id, order!.clientId));
      await database.update(orders).set({ status: 'refunded' }).where(eq(orders.id, fixture.orderId));
      supabase.mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: randomUUID(), email: client!.email, email_confirmed_at: new Date().toISOString() } }, error: null }) } });
      await expect(linkVerifiedCustomerAccount({} as never)).rejects.toMatchObject({ statusCode: 403 });
    });
    it('rejects cross-customer invoice/order links at the database boundary', async () => {
      const first = await seed();
      const second = await seed();
      await expect(getDatabase().insert(invoices).values({
        invoiceNumber: `cross-${first.reference}`, orderId: first.orderId, clientId: second.clientId,
        sellerName: 'Test seller', clientName: 'Test buyer', clientEmail: 'fixture@example.test',
      })).rejects.toMatchObject({ cause: { constraint_name: 'invoices_order_client_fk' } });
    });
    it('rejects over-crediting, wrong payment ownership and outbox cross-links', async () => {
      const database = getDatabase();
      const first = await seed();
      const second = await seed();
      const id = (await reconcileOrderInvoice(first.orderId))!;
      const secondId = (await reconcileOrderInvoice(second.orderId))!;
      await database.insert(paymentRefunds).values({ paymentId: first.paymentId, status: 'processed', amountCents: 3000 });
      await reconcileOrderInvoice(first.orderId);
      const [credit] = await database.select().from(invoiceCredits).where(eq(invoiceCredits.invoiceId, id));
      await expect(database.insert(invoiceDeliveries).values({ invoiceId: secondId, creditId: credit!.id }))
        .rejects.toMatchObject({ cause: { message: expect.stringContaining('another invoice') } });
      await database.update(payments).set({ status: 'reversed' }).where(eq(payments.id, first.paymentId));
      await expect(database.insert(invoiceCredits).values({ invoiceId: id, paymentId: first.paymentId, amountCents: 8000, reason: 'reversal', creditNumber: `over-${first.reference}`, sourceKey: `reversal:${first.paymentId}` }))
        .rejects.toMatchObject({ cause: { message: expect.stringContaining('overage') } });
      await expect(database.insert(invoiceCredits).values({ invoiceId: id, paymentId: second.paymentId, amountCents: 1, reason: 'reversal', creditNumber: `wrong-${first.reference}`, sourceKey: `reversal:${second.paymentId}` }))
        .rejects.toMatchObject({ cause: { message: expect.stringContaining('does not match') } });
    });
    it('retries failed email delivery durably and prevents concurrent sends', async () => {
      const database = getDatabase();
      // Isolate the relevant outbox without deleting any financial history.
      await database.update(invoiceDeliveries).set({ nextAttemptAt: new Date(Date.now() + 86400000) }).where(sql`true`);
      const fixture = await seed();
      const id = (await reconcileOrderInvoice(fixture.orderId))!;
      send.mockRejectedValueOnce(new Error('SES unavailable'));
      expect(await deliverInvoices()).toMatchObject({ failed: 1 });
      const [pending] = await database.select().from(invoiceDeliveries).where(eq(invoiceDeliveries.invoiceId, id));
      expect(pending).toMatchObject({ attempts: 1, sentAt: null, leaseUntil: null });
      expect(await retryInvoiceDelivery(id)).toEqual({ queued: 1 });
      const entered = createBarrier();
      const finish = createBarrier<{ messageId: string }>();
      send.mockImplementationOnce(() => { entered.resolve(); return finish.promise; });
      const delivery = deliverInvoices();
      await entered.promise;
      expect(await deliverInvoices()).toEqual({ sent: 0, failed: 0 });
      finish.resolve({ messageId: 'fixture' });
      expect(await delivery).toMatchObject({ sent: 1 });
      expect(send.mock.lastCall?.[0].to).toEqual([{ email: 'safe@example.test' }]);
      expect(await retryInvoiceDelivery(id)).toEqual({ queued: 0 });
    });
    it('records issuance review and backoff rather than blocking every subsequent run', async () => {
      const database = getDatabase();
      const fixture = await seed({ missingName: true });
      const failed: number[] = [];
      for (let index = 0; index < 4 && !failed.includes(fixture.orderId); index++) failed.push(...(await reconcilePurchaseInvoices()).failedOrderIds);
      expect(failed).toContain(fixture.orderId);
      const [job] = await database.select().from(invoiceProcessingJobs).where(eq(invoiceProcessingJobs.orderId, fixture.orderId));
      expect(job).toMatchObject({ reviewRequired: 1, attempts: 1 });
      expect((await reconcilePurchaseInvoices()).failedOrderIds).not.toContain(fixture.orderId);
    });
  });
}
