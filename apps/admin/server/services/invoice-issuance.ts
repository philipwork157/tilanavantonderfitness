import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { invoiceCredits, invoiceDeliveries, invoiceItems, invoiceProcessingJobs, invoices, orderItems, orders, payments, paymentRefunds } from '@tilana/db/schema';
import { getDatabase } from '@server/utils/database';
import { assertPaystackDatabaseEnvironment } from '@server/utils/paystack-configuration';
import { INVOICE_SELLER, validateInvoicePurchase } from './invoice-policy';
import { formatBillingDate } from '@tilana/contracts/invoices';

/** Issue from settled server evidence. Order serialization plus unique indexes make retries safe. */
export async function reconcileOrderInvoice(orderId: number) {
  const database = getDatabase();
  await assertPaystackDatabaseEnvironment(database);
  return database.transaction(async transaction => {
    const [order] = await transaction.select().from(orders).where(eq(orders.id, orderId)).for('update');
    if (!order) throw new Error('Purchase not found.');
    const settled = await transaction.select().from(payments).where(and(
      eq(payments.orderId, order.id), eq(payments.provider, 'paystack'), isNotNull(payments.paidAt),
      inArray(payments.status, ['succeeded', 'partially_refunded', 'refunded', 'reversed']),
    )).orderBy(asc(payments.id));
    if (!settled.length) return null;
    // More than one successful attempt requires human allocation, not invented accounting.
    if (settled.length !== 1) throw new Error('Multiple settled attempts require billing review.');
    const payment = settled[0]!;
    let [invoice] = await transaction.select().from(invoices).where(and(eq(invoices.orderId, order.id), eq(invoices.source, 'purchase')));
    if (!invoice) {
      const items = await transaction.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.id));
      validateInvoicePurchase(order, payment, items);
      if (!order.customerEmail || !order.customerName || !payment.paidAt) {
        throw new Error('Missing original buyer snapshot requires billing review.');
      }
      const [sequence] = await transaction.execute<{ value: string }>(sql`select nextval('billing_document_number')::text as value`);
      const issuedAt = new Date();
      [invoice] = await transaction.insert(invoices).values({
        ...INVOICE_SELLER, invoiceNumber: `TVT-INV-${sequence!.value.padStart(8, '0')}`,
        source: 'purchase', settledPaymentId: payment.id, clientId: order.clientId, orderId: order.id,
        status: 'draft', currency: order.currency, subtotalCents: order.subtotalCents,
        discountCents: order.discountCents, taxCents: 0, totalCents: order.totalCents,
        clientName: order.customerName, clientEmail: order.customerEmail, clientPhone: order.customerPhone,
        issueDate: formatBillingDate(issuedAt), issuedAt, paidAt: payment.paidAt,
      }).returning();
      if (!invoice) throw new Error('Invoice issuance failed.');
      await transaction.insert(invoiceItems).values(items.map(item => ({
        invoiceId: invoice!.id, programVolumeId: item.programVolumeId, description: item.description,
        quantity: item.quantity, unitPriceCents: item.unitPriceCents, lineTotalCents: item.lineTotalCents,
      })));
      await transaction.update(invoices).set({ status: 'paid' }).where(eq(invoices.id, invoice.id));
      await transaction.insert(invoiceDeliveries).values({ invoiceId: invoice.id });
    }
    if (invoice.settledPaymentId !== payment.id) throw new Error('Invoice settlement requires billing review.');
    const existing = await transaction.select().from(invoiceCredits).where(eq(invoiceCredits.invoiceId, invoice.id));
    let credited = existing.reduce((sum, credit) => sum + credit.amountCents, 0);
    const refunds = await transaction.select().from(paymentRefunds).where(and(eq(paymentRefunds.paymentId, payment.id), eq(paymentRefunds.status, 'processed'))).orderBy(asc(paymentRefunds.id));
    const addCredit = async (amount: number, reason: 'refund' | 'reversal', refundId: number | null) => {
      if (credited + amount > invoice!.totalCents) throw new Error('Credit total requires billing review.');
      const [sequence] = await transaction.execute<{ value: string }>(sql`select nextval('billing_document_number')::text as value`);
      const [credit] = await transaction.insert(invoiceCredits).values({
        invoiceId: invoice!.id, paymentId: payment.id, refundId, reason, amountCents: amount,
        creditNumber: `TVT-CN-${sequence!.value.padStart(8, '0')}`,
        sourceKey: refundId === null ? `reversal:${payment.id}` : `refund:${refundId}`,
      }).returning();
      await transaction.insert(invoiceDeliveries).values({ invoiceId: invoice!.id, creditId: credit!.id });
      credited += amount;
    };
    // A prior full reversal already adjusted the commercial balance. Later refund
    // evidence remains in the payment ledger, not a second credit for the same sale.
    if (!existing.some(credit => credit.reason === 'reversal')) {
      for (const refund of refunds) {
        if (!existing.some(credit => credit.refundId === refund.id)) await addCredit(refund.amountCents, 'refund', refund.id);
      }
      if (payment.status === 'reversed' && credited < invoice.totalCents) await addCredit(invoice.totalCents - credited, 'reversal', null);
    }
    await transaction.update(invoices).set({ reconciledAt: new Date() }).where(eq(invoices.id, invoice.id));
    return invoice.id;
  });
}

/** Bounded durable catch-up also handles closed browsers and later refunds. */
export async function reconcilePurchaseInvoices() {
  await assertPaystackDatabaseEnvironment();
  const database = getDatabase();
  const candidates = await database.select({ orderId: payments.orderId }).from(payments)
    .leftJoin(invoices, and(eq(invoices.orderId, payments.orderId), eq(invoices.source, 'purchase')))
    .leftJoin(invoiceProcessingJobs, eq(invoiceProcessingJobs.orderId, payments.orderId))
    .where(and(eq(payments.provider, 'paystack'), isNotNull(payments.paidAt),
      or(isNull(invoiceProcessingJobs.id), lt(invoiceProcessingJobs.nextAttemptAt, new Date())),
      inArray(payments.status, ['succeeded', 'partially_refunded', 'refunded', 'reversed']),
      or(isNull(invoices.id), isNull(invoices.reconciledAt), lt(invoices.reconciledAt, payments.updatedAt),
        // Provider transactions can set updated_at before waiting for our order lock.
        // Missing ledger adjustments, not timestamps alone, determine remaining work.
        sql`exists (
          select 1 from ${paymentRefunds}
          where ${paymentRefunds.paymentId} = ${payments.id} and ${paymentRefunds.status} = 'processed'
          and not exists (select 1 from ${invoiceCredits} where ${invoiceCredits.refundId} = ${paymentRefunds.id})
          and not exists (select 1 from ${invoiceCredits} where ${invoiceCredits.invoiceId} = ${invoices.id} and ${invoiceCredits.reason} = 'reversal')
        )`,
        and(eq(payments.status, 'reversed'), sql`coalesce((select sum(${invoiceCredits.amountCents}) from ${invoiceCredits} where ${invoiceCredits.invoiceId} = ${invoices.id}), 0) < ${invoices.totalCents}`))))
    .orderBy(asc(payments.updatedAt)).limit(20);
  let issued = 0;
  const failedOrderIds: number[] = [];
  for (const { orderId } of candidates) {
    try {
      if (await reconcileOrderInvoice(orderId)) issued++;
      await database.update(invoiceProcessingJobs).set({ attempts: 0, reviewRequired: 0, nextAttemptAt: new Date() }).where(eq(invoiceProcessingJobs.orderId, orderId));
    } catch {
      failedOrderIds.push(orderId);
      await database.insert(invoiceProcessingJobs).values({ orderId, attempts: 1, reviewRequired: 1, nextAttemptAt: new Date(Date.now() + 15 * 60_000) })
        .onConflictDoUpdate({ target: invoiceProcessingJobs.orderId, set: { attempts: sql`${invoiceProcessingJobs.attempts} + 1`, reviewRequired: 1, nextAttemptAt: new Date(Date.now() + 6 * 60 * 60_000) } });
    }
  }
  return { reconciled: issued, failedOrderIds };
}
