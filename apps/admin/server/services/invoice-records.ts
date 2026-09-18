import { and, desc, eq, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm';
import { invoiceCredits, invoiceDeliveries, invoiceEditions, invoiceItems, invoices } from '@tilana/db/schema';
import type { InvoiceList } from '@tilana/contracts/invoices';
import { getDatabase } from '@server/utils/database';
import { assertPaystackDatabaseEnvironment } from '@server/utils/paystack-configuration';

/** Customer scope is a verified integer client ID, never an email or request parameter. */
export async function listInvoices(clientId?: number, before?: number): Promise<InvoiceList> {
  await assertPaystackDatabaseEnvironment();
  const database = getDatabase();
  const records = await database.select().from(invoices).where(and(
    or(eq(invoices.source, 'purchase'), eq(invoices.managed, 1)), clientId === undefined ? undefined : and(eq(invoices.clientId, clientId), isNotNull(invoices.issuedAt), inArray(invoices.status, ['issued', 'paid', 'void'])),
    before === undefined ? undefined : lt(invoices.id, before),
  )).orderBy(desc(invoices.id)).limit(51);
  const page = records.slice(0, 50);
  const credits = page.length ? await database.select().from(invoiceCredits).where(inArray(invoiceCredits.invoiceId, page.map(invoice => invoice.id))) : [];
  const editions = page.length ? await database.select().from(invoiceEditions).where(inArray(invoiceEditions.invoiceId, page.map(invoice => invoice.id))) : [];
  return {
    hasMore: records.length > 50,
    invoices: page.map(invoice => {
      const adjustments = credits.filter(credit => credit.invoiceId === invoice.id).map(credit => ({
        id: credit.id, creditNumber: credit.creditNumber, amountCents: credit.amountCents, reason: credit.reason,
      }));
      return { id: invoice.id, invoiceNumber: invoice.invoiceNumber, clientName: invoice.clientName,
        status: invoice.status, currency: invoice.currency, totalCents: invoice.totalCents, issueDate: invoice.issueDate,
        creditedCents: adjustments.reduce((sum, credit) => sum + credit.amountCents, 0), credits: adjustments,
        editions: editions.filter(edition => edition.invoiceId === invoice.id).map(edition => ({ id: edition.id, issuedAt: edition.issuedAt.toISOString() })) };
    }),
  };
}

/** Financial documents remain owned by their customer even after program access is revoked. */
export async function getInvoiceDocument(invoiceId: number, clientId?: number, creditId?: number, editionId?: number) {
  await assertPaystackDatabaseEnvironment();
  const database = getDatabase();
  const [invoice] = await database.select().from(invoices).where(and(eq(invoices.id, invoiceId), or(eq(invoices.source, 'purchase'), eq(invoices.managed, 1)),
    clientId === undefined ? undefined : and(eq(invoices.clientId, clientId), isNotNull(invoices.issuedAt), inArray(invoices.status, ['issued', 'paid', 'void'])))).limit(1);
  if (!invoice) throw createError({ statusCode: 404, statusMessage: 'Invoice not found.' });
  const items = await database.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id)).orderBy(invoiceItems.id);
  const [credit] = creditId === undefined ? [] : await database.select().from(invoiceCredits)
    .where(and(eq(invoiceCredits.id, creditId), eq(invoiceCredits.invoiceId, invoice.id))).limit(1);
  if (creditId !== undefined && !credit) throw createError({ statusCode: 404, statusMessage: 'Credit note not found.' });
  const [edition] = editionId === undefined ? [] : await database.select().from(invoiceEditions).where(and(eq(invoiceEditions.id, editionId), eq(invoiceEditions.invoiceId, invoice.id))).limit(1);
  if (editionId !== undefined && (!edition || creditId !== undefined)) throw createError({ statusCode: 404, statusMessage: 'Invoice edition not found.' });
  return { invoice, items, credit: credit ?? null, edition: edition ?? null };
}

/** Retry only an unsent outbox record; no financial edits or recipient overrides are accepted. */
export async function retryInvoiceDelivery(invoiceId: number) {
  await getInvoiceDocument(invoiceId);
  const database = getDatabase();
  const queued = await database.update(invoiceDeliveries).set({ nextAttemptAt: new Date() })
    .where(and(eq(invoiceDeliveries.invoiceId, invoiceId), isNull(invoiceDeliveries.sentAt), isNull(invoiceDeliveries.canceledAt), isNull(invoiceDeliveries.leaseUntil)))
    .returning({ id: invoiceDeliveries.id });
  return { queued: queued.length };
}
