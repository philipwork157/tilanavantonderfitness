import { readFile, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { renderInvoicePdf } from '@server/services/invoice-pdf';
import { invoiceDocumentFixture } from './helpers/invoice-document-fixture';

const font = await readFile(new URL('../server/assets/fonts/NotoSans-Regular.ttf', import.meta.url));
describe('private snapshot PDF rendering', () => {
  it('renders a two-volume invoice with embedded accented customer text', async () => {
    const bytes = await renderInvoicePdf(invoiceDocumentFixture(), font);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe('TVT-INV-00000001');
    if (process.env.BILLING_PDF_QA_OUTPUT) await writeFile(process.env.BILLING_PDF_QA_OUTPUT, bytes);
  });
  it('wraps long descriptions onto additional pages rather than clipping', async () => {
    const document = invoiceDocumentFixture();
    document.items = Array.from({ length: 10 }, (_value, index) => ({ ...document.items[0]!, id: index + 1, description: 'Long program description '.repeat(10) }));
    const pdf = await PDFDocument.load(await renderInvoicePdf(document, font));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
  it('renders a linked credit note without replacing the original invoice amount', async () => {
    const document = invoiceDocumentFixture();
    const bytes = await renderInvoicePdf({ ...document, credit: {
      id: 1, invoiceId: 1, paymentId: 1, refundId: 1, creditNumber: 'TVT-CN-00000002', sourceKey: 'refund:1',
      reason: 'refund', amountCents: 3000, issuedAt: new Date('2026-09-17T12:00:00Z'),
    } }, font);
    expect((await PDFDocument.load(bytes)).getTitle()).toBe('TVT-CN-00000002');
    expect(document.invoice.totalCents).toBe(59800);
  });
  it('rejects unavailable font glyphs rather than corrupting the name', async () => {
    const document = invoiceDocumentFixture();
    document.invoice.clientName = 'Buyer 😀';
    await expect(renderInvoicePdf(document, font)).rejects.toThrow('supported PDF font');
  });
  it('renders an audited edition without mutating the original snapshot', async () => {
    const document = invoiceDocumentFixture();
    const bytes = await renderInvoicePdf({ ...document, edition: { id: 2, invoiceId: 1, clientName: 'Zoë Corrected Buyer', clientPhone: null,
      clientAddress: 'Correct billing address', reason: 'Corrected customer billing name and address', createdByUserId: 1, issuedAt: new Date('2026-09-18T10:00:00Z') } }, font);
    expect(document.invoice.clientName).toBe('Zoë Test Buyer');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    if (process.env.BILLING_PDF_EDITION_QA_OUTPUT) await writeFile(process.env.BILLING_PDF_EDITION_QA_OUTPUT, bytes);
  });
  it('renders an issued unpaid service invoice without claiming payment was received', async () => {
    const document = invoiceDocumentFixture();
    document.invoice = { ...document.invoice, source: 'manual', managed: 1, status: 'issued', paidAt: null, settledPaymentId: null };
    document.items = [{ ...document.items[0]!, programVolumeId: null, description: 'Monthly coaching', quantity: 2, unitPriceCents: 29900, lineTotalCents: 59800 }];
    const bytes = await renderInvoicePdf(document, font);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
    if (process.env.BILLING_PDF_MANUAL_QA_OUTPUT) await writeFile(process.env.BILLING_PDF_MANUAL_QA_OUTPUT, bytes);
  });
});
