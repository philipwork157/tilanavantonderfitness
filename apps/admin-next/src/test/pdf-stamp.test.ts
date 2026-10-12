import { degrees, PDFDict, PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { checkStampable, hiddenMarker, PdfStampError, purchaseDate, stampProgramPdf } from '@/server/utils/pdf-stamp';

/** A small program-like PDF: portrait, landscape and a rotated page. */
async function samplePdf(options: { encrypted?: boolean } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([595, 842]).drawText('Beginner Volume 1', { x: 60, y: 700, size: 30, font });
  doc.addPage([842, 595]).drawText('Week 1', { x: 60, y: 500, size: 20, font });
  const turned = doc.addPage([595, 842]);
  turned.setRotation(degrees(90));
  turned.drawText('Turned page', { x: 60, y: 500, size: 20, font });
  doc.setCreationDate(new Date('2026-01-01T00:00:00Z'));
  doc.setModificationDate(new Date('2026-01-01T00:00:00Z'));
  if (options.encrypted) doc.context.trailerInfo.Encrypt = doc.context.obj({ Filter: 'Standard' });
  return doc.save();
}

/** The text a reader (or a copy-paste) gets from each page. */
async function pageTexts(pdf: Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: false });
  const doc = await task.promise;
  const texts: string[] = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const content = await (await doc.getPage(n)).getTextContent();
    texts.push(content.items.map(item => ('str' in item ? item.str : '')).join(' '));
  }
  await task.destroy();
  return texts;
}

const buyer = { name: 'Jane Smith', orderNumber: 'TV-7K4Q9P', purchasedAt: new Date('2026-10-12T09:00:00Z') };

describe('personalised program PDFs', () => {
  it('prints the buyer, order and purchase date on every page, and the seal on the cover', async () => {
    const { data } = await stampProgramPdf(await samplePdf(), buyer);
    const texts = await pageTexts(data);
    expect(texts).toHaveLength(3);
    for (const page of texts) {
      expect(page).toContain('Licensed to Jane Smith · Order TV-7K4Q9P · 12 October 2026');
      expect(page).toContain('tvt-order:TV-7K4Q9P');
    }
    expect(texts[0]).toContain('PERSONAL COPY');
    expect(texts[1]).not.toContain('PERSONAL COPY');
  });

  it('hides the order number in the file properties too', async () => {
    const { data } = await stampProgramPdf(await samplePdf(), buyer);
    const doc = await PDFDocument.load(data, { updateMetadata: false });
    expect(doc.getSubject()).toContain('TV-7K4Q9P');
    expect(doc.getKeywords()).toContain(hiddenMarker('TV-7K4Q9P'));
    const info = doc.context.lookup(doc.context.trailerInfo.Info, PDFDict);
    expect(info.get(PDFName.of('TVTOrder'))?.toString()).toBe('(TV-7K4Q9P)');
  });

  it('gives the same order the same file every time (resends match the fingerprint)', async () => {
    const pdf = await samplePdf();
    const first = await stampProgramPdf(pdf, buyer);
    const again = await stampProgramPdf(pdf, buyer);
    const other = await stampProgramPdf(pdf, { ...buyer, orderNumber: 'TV-OTHER1' });
    expect(again.sha256).toBe(first.sha256);
    expect(other.sha256).not.toBe(first.sha256);
    expect(first.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('copes with names the font cannot draw and with no name at all', async () => {
    const pdf = await samplePdf();
    const mixed = await pageTexts((await stampProgramPdf(pdf, { ...buyer, name: 'Zoë Nomvula Müller 张伟' })).data);
    expect(mixed[0]).toContain('Licensed to Zoë Nomvula Müller · Order TV-7K4Q9P');
    const none = await pageTexts((await stampProgramPdf(pdf, { ...buyer, name: '张伟' })).data);
    expect(none[1]).toContain('Personal copy · Order TV-7K4Q9P');
  });

  it('dates the purchase in South African time', () => {
    expect(purchaseDate(new Date('2026-12-31T22:30:00Z'))).toBe('1 January 2027');
  });

  it('refuses password-protected and broken PDFs with a clear message', async () => {
    await expect(checkStampable(await samplePdf({ encrypted: true }))).rejects.toThrow(PdfStampError);
    await expect(checkStampable(await samplePdf({ encrypted: true }))).rejects.toThrow('password-protected');
    await expect(checkStampable(Buffer.from('%PDF-1.7 not really %%EOF'))).rejects.toThrow(PdfStampError);
    await expect(checkStampable(await samplePdf())).resolves.toBeUndefined();
  });
});
