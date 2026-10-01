import { and, asc, eq, isNull, lte, or } from 'drizzle-orm';
import { invoiceDeliveries } from '@tilana/db/schema';
import { formatInvoiceMoney } from '@tilana/contracts/invoices';
import { getDatabase } from '@server/utils/database';
import { getEmailRecipient } from '@server/utils/email-delivery';
import { getServerEmail } from '@server/utils/email';
import { getCustomerAccountBaseUrl, getPaystackEnvironment } from '@server/utils/paystack-configuration';
import { escapeEmailHtml } from '@server/email-templates/html';
import { getInvoiceDocument } from './invoice-records';

/** Test billing must use a safe inbox; a production deployment cannot redirect live invoices. */
export function getInvoiceRecipient(intendedEmail: string, config = useRuntimeConfig()) {
  const mode = getPaystackEnvironment(config);
  return getEmailRecipient(intendedEmail, { test: mode === 'test', live: mode === 'live' }, config);
}

/** At-least-once SES delivery with durable backoff and versioned leases. */
export async function deliverInvoices() {
  const database = getDatabase();
  let sent = 0;
  let failed = 0;
  for (let index = 0; index < 5; index++) {
    const now = new Date();
    const job = await database.transaction(async transaction => {
      const [pending] = await transaction.select().from(invoiceDeliveries).where(and(isNull(invoiceDeliveries.sentAt), isNull(invoiceDeliveries.canceledAt),
        lte(invoiceDeliveries.nextAttemptAt, now), or(isNull(invoiceDeliveries.leaseUntil), lte(invoiceDeliveries.leaseUntil, now))))
        .orderBy(asc(invoiceDeliveries.nextAttemptAt), asc(invoiceDeliveries.id)).limit(1).for('update', { skipLocked: true });
      if (!pending) return null;
      const [leased] = await transaction.update(invoiceDeliveries).set({
        leaseUntil: new Date(now.getTime() + 10 * 60_000), leaseVersion: pending.leaseVersion + 1, attempts: pending.attempts + 1,
      }).where(eq(invoiceDeliveries.id, pending.id)).returning();
      return leased!;
    });
    if (!job) break;
    const ownership = and(eq(invoiceDeliveries.id, job.id), eq(invoiceDeliveries.leaseVersion, job.leaseVersion));
    try {
      const { invoice, credit, edition } = await getInvoiceDocument(job.invoiceId, undefined, job.creditId ?? undefined, job.editionId ?? undefined);
      if (invoice.status === 'void' || invoice.status === 'draft') throw new Error('Invoice is not deliverable.');
      const recipient = getInvoiceRecipient(invoice.clientEmail);
      const accountUrl = `${getCustomerAccountBaseUrl()}/account/invoices`;
      const number = credit?.creditNumber ?? invoice.invoiceNumber;
      const kind = credit ? 'Credit note' : edition ? 'Reissued invoice' : 'Invoice';
      const amount = formatInvoiceMoney(credit?.amountCents ?? invoice.totalCents, invoice.currency);
      const text = `${kind} ${number}\n${amount}\n${credit ? 'Adjustment to' : invoice.status === 'paid' ? 'Payment received for' : 'Payment not yet recorded for'} invoice ${invoice.invoiceNumber}.\nSign in with your customer email to download your private document: ${accountUrl}\n${invoice.notes || ''}`;
      const { sender, from } = getServerEmail();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([sender.send({ from, to: [{ email: recipient }], subject: `${kind} ${number} | Tilana van Tonder`,
          text, html: `<p>${escapeEmailHtml(kind)} ${escapeEmailHtml(number)}</p><p>${escapeEmailHtml(amount)}</p><p><a href="${escapeEmailHtml(accountUrl)}">Sign in to view your invoices and credit notes</a></p><p>${escapeEmailHtml(invoice.notes || '')}</p>`,
        }), new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Invoice delivery timed out.')), 10_000); })]);
      } finally { clearTimeout(timer); }
      await database.update(invoiceDeliveries).set({ sentAt: new Date(), leaseUntil: null }).where(ownership);
      sent++;
    } catch {
      await database.update(invoiceDeliveries).set({ leaseUntil: null,
        nextAttemptAt: new Date(Date.now() + Math.min(6 * 60 * 60_000, 60_000 * 2 ** Math.min(job.attempts, 12))),
      }).where(ownership);
      failed++;
    }
  }
  return { sent, failed };
}
