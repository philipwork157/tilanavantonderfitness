import type { H3Event } from 'h3';
import type { getInvoiceDocument } from '@server/services/invoice-records';
import { renderInvoicePdf } from '@server/services/invoice-pdf';

/** Stream authenticated documents, with no public storage URL or cacheable response. */
export async function sendInvoicePdf(event: H3Event, document: Awaited<ReturnType<typeof getInvoiceDocument>>) {
  const font = await useStorage('assets:server').getItemRaw<Uint8Array>('fonts/NotoSans-Regular.ttf');
  if (!font) throw createError({ statusCode: 503, statusMessage: 'Invoice rendering is unavailable.' });
  const number = (document.credit?.creditNumber ?? document.invoice.invoiceNumber) + (document.edition ? `-E${document.edition.id}` : '');
  setHeader(event, 'cache-control', 'private, no-store');
  setHeader(event, 'content-type', 'application/pdf');
  setHeader(event, 'x-content-type-options', 'nosniff');
  setHeader(event, 'content-disposition', `attachment; filename="${number.replace(/[^A-Za-z0-9-]/g, '')}.pdf"`);
  return Buffer.from(await renderInvoicePdf(document, font));
}
