import type { invoices, invoiceItems } from '@tilana/db/schema';
import { INVOICE_SELLER } from '@server/services/invoice-policy';

/** Synthetic billing data only; never render an actual customer's details in tests. */
export function invoiceDocumentFixture() {
  const date = new Date('2026-09-17T12:00:00Z');
  const invoice: typeof invoices.$inferSelect = {
    ...INVOICE_SELLER, id: 1, source: 'purchase', settledPaymentId: 1, reconciledAt: date,
    invoiceNumber: 'TVT-INV-00000001', clientId: 1, orderId: 1, status: 'paid', currency: 'ZAR',
    subtotalCents: 59800, discountCents: 0, taxCents: 0, totalCents: 59800,
    sellerEmail: null, sellerPhone: null, clientName: 'Zoë Test Buyer', clientEmail: 'fixture@example.test',
    clientPhone: null, clientAddress: null, issueDate: '2026-09-17', dueDate: null,
    pdfR2Bucket: null, pdfR2ObjectKey: null, createdByUserId: null, issuedAt: date, paidAt: date, createdAt: date, updatedAt: date,
  };
  const items: Array<typeof invoiceItems.$inferSelect> = [
    { id: 1, invoiceId: 1, programVolumeId: 1, description: 'Beginner · Volume 1', quantity: 1, unitPriceCents: 39900, lineTotalCents: 39900, createdAt: date },
    { id: 2, invoiceId: 1, programVolumeId: 2, description: 'Mobility · Volume 1', quantity: 1, unitPriceCents: 19900, lineTotalCents: 19900, createdAt: date },
  ];
  return { invoice, items, credit: null };
}
