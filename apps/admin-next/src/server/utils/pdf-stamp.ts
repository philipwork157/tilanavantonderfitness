import 'server-only';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { degrees, EncryptedPDFError, PDFDict, PDFDocument, PDFName, PDFString, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

/*
 * Every buyer gets their own copy of a program PDF. The clean PDF in the
 * private bucket is never changed; the copy is stamped just before it is
 * emailed, so a shared copy can be traced back to its order:
 *
 *  - Visible: a footer on every page ("Licensed to Jane Smith · Order
 *    TV-7K4Q9P · 12 October 2026 · Personal use only") and a "Personal copy"
 *    seal on the cover.
 *  - Hidden: the order number in the file's properties (subject, keywords and
 *    a TVTOrder entry) and as invisible text on every page, which survive
 *    cropping or covering the footer.
 *  - Fingerprint: the stamped file's SHA-256 is saved on the order item, so
 *    an unchanged copy found online matches its order exactly.
 *
 * The same order always gives the same bytes (no "now" dates), so a resent
 * email carries an identical copy with the same fingerprint.
 */

export type StampDetails = {
  /** The buyer's name as given at checkout. */
  name: string;
  orderNumber: string;
  /** When they paid; printed as the purchase date. */
  purchasedAt: Date;
};

export class PdfStampError extends Error {}

/** The marker hidden on every page and in the file properties. */
export const hiddenMarker = (orderNumber: string) => `tvt-order:${orderNumber}`;

const INK = rgb(0.42, 0.27, 0.18); // dark caramel
const PAPER = rgb(0.988, 0.957, 0.933); // cream
const FOOTER_MARGIN = 9; // points from the bottom edge to the footer band
const SIDE_MARGIN = 18;

let fonts: Promise<{ regular: Uint8Array; semibold: Uint8Array }> | undefined;
function fontFiles() {
  // The fonts ship with the admin (assets/fonts, Montserrat, SIL Open Font License).
  const folder = path.join(process.cwd(), 'assets', 'fonts');
  return fonts ??= Promise.all([
    readFile(path.join(folder, 'Montserrat-Regular.ttf')),
    readFile(path.join(folder, 'Montserrat-SemiBold.ttf')),
  ]).then(([regular, semibold]) => ({ regular, semibold }));
}

/** "12 October 2026", in South African time. */
export function purchaseDate(date: Date): string {
  return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Johannesburg' });
}

/** The name with only characters the font can draw; spaces tidied. */
function printable(text: string, font: PDFFont): string {
  const supported = new Set(font.getCharacterSet());
  return [...text.normalize('NFC')]
    .filter(char => char === ' ' || supported.has(char.codePointAt(0)!))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Shortens text with "…" until it fits `width` at `size`. */
function fit(text: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let cut = text;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}…`, size) > width) cut = cut.slice(0, -1).trimEnd();
  return `${cut}…`;
}

/**
 * Draws in "what the reader sees" coordinates: (0, 0) is the bottom-left of
 * the page as displayed, whatever the page's rotation and crop box.
 */
function viewOf(page: PDFPage) {
  const box = page.getCropBox();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  const turned = rotation === 90 || rotation === 270;
  const width = turned ? box.height : box.width;
  const height = turned ? box.width : box.height;
  const at = (x: number, y: number): { x: number; y: number } => {
    switch (rotation) {
      case 90: return { x: box.x + box.width - y, y: box.y + x };
      case 180: return { x: box.x + box.width - x, y: box.y + box.height - y };
      case 270: return { x: box.x + y, y: box.y + box.height - x };
      default: return { x: box.x + x, y: box.y + y };
    }
  };
  return { width, height, at, rotate: degrees(rotation) };
}

type View = ReturnType<typeof viewOf>;

function text(page: PDFPage, view: View, value: string, x: number, y: number, font: PDFFont, size: number, options: { opacity?: number; color?: ReturnType<typeof rgb> } = {}) {
  page.drawText(value, { ...view.at(x, y), rotate: view.rotate, font, size, color: options.color ?? INK, opacity: options.opacity ?? 1 });
}

/** A light band with one centred line, so it reads on any background. */
function drawFooter(page: PDFPage, view: View, lines: string[], font: PDFFont) {
  const available = view.width - SIDE_MARGIN * 2;
  let size = 6.5;
  let line = lines[0]!;
  // Smaller first, then the shorter wording, then shorten the name.
  pick: for (const candidate of lines) {
    for (size = 6.5; size >= 5; size -= 0.5) {
      if (font.widthOfTextAtSize(candidate, size) <= available) {
        line = candidate;
        break pick;
      }
    }
  }
  if (font.widthOfTextAtSize(line, size) > available) {
    size = 5;
    line = fit(lines[lines.length - 1]!, font, size, available);
  }
  const width = font.widthOfTextAtSize(line, size);
  const padX = 5;
  const bandHeight = size + 5;
  const left = (view.width - width) / 2;
  const corner = view.at(left - padX, FOOTER_MARGIN);
  page.drawRectangle({
    ...corner,
    width: width + padX * 2,
    height: bandHeight,
    rotate: view.rotate,
    color: PAPER,
    opacity: 0.82,
  });
  text(page, view, line, left, FOOTER_MARGIN + (bandHeight - size) / 2 + size * 0.18, font, size);
}

/** The round "Personal copy" seal, bottom-right of the cover, above the footer. */
function drawSeal(page: PDFPage, view: View, name: string, date: string, fonts: { regular: PDFFont; semibold: PDFFont }) {
  const radius = Math.min(40, view.width * 0.09);
  const cx = view.width - radius - 22;
  const cy = FOOTER_MARGIN + 18 + radius;
  const centre = view.at(cx, cy);
  page.drawCircle({ ...centre, size: radius, color: PAPER, opacity: 0.94, borderColor: INK, borderWidth: 1.1 });
  page.drawCircle({ ...centre, size: radius - 3.2, borderColor: INK, borderWidth: 0.4, borderOpacity: 0.7 });

  const inner = radius * 1.55;
  const label = 'PERSONAL COPY';
  const labelSize = radius * 0.15;
  text(page, view, label, cx - fonts.semibold.widthOfTextAtSize(label, labelSize) / 2, cy + radius * 0.3, fonts.semibold, labelSize);

  let nameSize = radius * 0.24;
  while (nameSize > radius * 0.15 && fonts.semibold.widthOfTextAtSize(name, nameSize) > inner) nameSize -= 0.25;
  const shownName = fit(name, fonts.semibold, nameSize, inner);
  text(page, view, shownName, cx - fonts.semibold.widthOfTextAtSize(shownName, nameSize) / 2, cy - nameSize * 0.35, fonts.semibold, nameSize);

  const dateSize = radius * 0.14;
  text(page, view, date, cx - fonts.regular.widthOfTextAtSize(date, dateSize) / 2, cy - radius * 0.48, fonts.regular, dateSize);
}

/** Opens the PDF the way stamping needs it; password-protected files are refused. */
async function open(pdf: Uint8Array): Promise<PDFDocument> {
  try {
    return await PDFDocument.load(pdf, { updateMetadata: false });
  }
  catch (error) {
    // pdf-lib's EncryptedPDFError does not survive `instanceof`, so its message is checked too.
    if (error instanceof EncryptedPDFError || /is encrypted/i.test(error instanceof Error ? error.message : '')) {
      throw new PdfStampError('This PDF is password-protected, so it cannot be personalised for each buyer. Export it again without a password and upload that.');
    }
    throw new PdfStampError('This PDF could not be opened for personalising. Export it again and upload that.');
  }
}

/** Returns the buyer's own copy of a program PDF and its SHA-256. Fails only with PdfStampError. */
export async function stampProgramPdf(pdf: Uint8Array, details: StampDetails): Promise<{ data: Buffer; sha256: string }> {
  try {
    return await stamp(pdf, details);
  }
  catch (error) {
    if (error instanceof PdfStampError) throw error;
    throw new PdfStampError('This PDF could not be personalised. Export it again and upload that.', { cause: error });
  }
}

async function stamp(pdf: Uint8Array, details: StampDetails): Promise<{ data: Buffer; sha256: string }> {
  const doc = await open(pdf);
  const pages = doc.getPages();
  if (!pages.length) throw new PdfStampError('This PDF has no pages.');

  doc.registerFontkit(fontkit);
  const files = await fontFiles();
  const regular = await doc.embedFont(files.regular, { subset: true });
  const semibold = await doc.embedFont(files.semibold, { subset: true });

  const name = printable(details.name, regular);
  const order = printable(details.orderNumber, regular);
  const date = purchaseDate(details.purchasedAt);
  const owner = name ? `Licensed to ${name}` : 'Personal copy';
  // Longest first; the footer uses the first that fits the page.
  const lines = [
    `${owner} · Order ${order} · ${date} · Personal use only, please do not share`,
    `${owner} · Order ${order} · ${date} · Personal use only`,
    `${owner} · Order ${order} · ${date}`,
  ];
  const marker = hiddenMarker(details.orderNumber);

  pages.forEach((page, index) => {
    const view = viewOf(page);
    if (index === 0) drawSeal(page, view, name || `Order ${order}`, date, { regular, semibold });
    drawFooter(page, view, lines, regular);
    // Invisible (fully transparent) but still part of the page's text.
    text(page, view, marker, view.width / 2, view.height / 2, regular, 1, { opacity: 0 });
  });

  doc.setSubject(`Personal copy for order ${details.orderNumber}. For personal use only.`);
  doc.setKeywords([marker, `order ${details.orderNumber}`]);
  doc.setProducer('Tilana van Tonder, personal copy');
  // Fixed dates, so the same order always gives the same file.
  doc.setModificationDate(details.purchasedAt);
  const info = doc.context.lookup(doc.context.trailerInfo.Info, PDFDict);
  info.set(PDFName.of('TVTOrder'), PDFString.of(details.orderNumber));

  const data = Buffer.from(await doc.save());
  return { data, sha256: createHash('sha256').update(data).digest('hex') };
}

/** Checked when a PDF is uploaded, so a file that can't be personalised is refused then, not at a sale. */
export async function checkStampable(pdf: Uint8Array): Promise<void> {
  await stampProgramPdf(pdf, { name: 'Test Buyer', orderNumber: 'TV-CHECK', purchasedAt: new Date('2026-01-01T10:00:00Z') });
}
