import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { getInvoiceDocument } from './invoice-records';
import { formatBillingDate, formatInvoiceMoney } from '@tilana/contracts/invoices';

type InvoiceDocument = Awaited<ReturnType<typeof getInvoiceDocument>>;

/** Generate private PDFs solely from issued snapshots. Font bytes come from bundled server assets. */
export async function renderInvoicePdf(document: InvoiceDocument, fontBytes: Uint8Array) {
  const { invoice, items, credit } = document;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const glyphs = new Set(font.getCharacterSet());
  let page = pdf.addPage([595.28, 841.89]);
  let y = 785;
  const ink = rgb(0.12, 0.1, 0.09);
  const line = (value: string, size = 11) => {
    // Never silently replace an unrepresentable customer name with missing glyphs.
    const clean = [...value].map(character => character.codePointAt(0)! < 32 || character.codePointAt(0) === 127 ? ' ' : character).join('');
    if ([...clean].some(character => !glyphs.has(character.codePointAt(0)!))) throw new Error('Invoice text requires a supported PDF font.');
    let remaining = clean;
    do {
      let length = remaining.length;
      while (length > 1 && font.widthOfTextAtSize(remaining.slice(0, length), size) > 490) length--;
      // Avoid splitting surrogate pairs; prefer a word boundary for wrapped prose.
      if (length < remaining.length) {
        const space = remaining.lastIndexOf(' ', length);
        if (space > length / 2) length = space;
        if (/[\uD800-\uDBFF]/.test(remaining[length - 1] || '')) length--;
      }
      if (y < 65) { page = pdf.addPage([595.28, 841.89]); y = 785; }
      page.drawText(remaining.slice(0, length), { x: 50, y, size, font, color: ink });
      y -= size + 7;
      remaining = remaining.slice(length).trimStart();
    } while (remaining.length);
  };
  line(invoice.sellerName, 23);
  for (const address of (invoice.sellerAddress || '').split('\n')) line(address);
  y -= 18;
  line(credit ? 'CREDIT NOTE' : 'INVOICE', 20);
  line(credit?.creditNumber ?? invoice.invoiceNumber, 13);
  line(`Issued: ${credit ? formatBillingDate(credit.issuedAt) : invoice.issueDate}`);
  if (credit) line(`Original invoice: ${invoice.invoiceNumber}`);
  else line(`Payment received: ${invoice.paidAt ? formatBillingDate(invoice.paidAt) : 'Not recorded'}`);
  y -= 15;
  line('Customer', 13);
  line(invoice.clientName);
  line(invoice.clientEmail);
  if (invoice.clientAddress) line(invoice.clientAddress);
  y -= 18;
  if (credit) {
    line(credit.reason === 'refund' ? 'Processed payment refund' : 'Verified payment reversal');
    line(`Credit amount: ${formatInvoiceMoney(credit.amountCents, invoice.currency)}`, 14);
  } else {
    line('Purchased programs', 13);
    for (const item of items) {
      line(item.description);
      line(`${item.quantity} x ${formatInvoiceMoney(item.unitPriceCents, invoice.currency)}     ${formatInvoiceMoney(item.lineTotalCents, invoice.currency)}`);
      y -= 8;
    }
    line(`Subtotal: ${formatInvoiceMoney(invoice.subtotalCents, invoice.currency)}`);
    if (invoice.discountCents) line(`Discount: ${formatInvoiceMoney(invoice.discountCents, invoice.currency)}`);
    line(`Total paid: ${formatInvoiceMoney(invoice.totalCents, invoice.currency)}`, 14);
  }
  y -= 20;
  line(invoice.notes || '');
  const pages = pdf.getPages();
  pages.forEach((current, index) => current.drawText(`Page ${index + 1} of ${pages.length}`, { x: 50, y: 30, size: 9, font, color: ink }));
  pdf.setTitle(credit?.creditNumber ?? invoice.invoiceNumber);
  pdf.setAuthor(invoice.sellerName);
  return pdf.save();
}
