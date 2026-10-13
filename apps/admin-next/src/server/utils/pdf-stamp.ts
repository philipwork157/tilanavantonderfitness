import 'server-only';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { degrees, EncryptedPDFError, PDFDict, PDFDocument, PDFName, PDFString, rgb, setCharacterSpacing, type PDFFont, type PDFPage } from 'pdf-lib';

/*
 * Every buyer gets their own copy of a program PDF. The clean PDF in the
 * private bucket is never changed; the copy is stamped just before it is
 * emailed, so a shared copy can be traced back to its order:
 *
 *  - Visible: a line under the page's own footer on every page ("PERSONAL
 *    COPY FOR JANE SMITH / ORDER TV-7K4Q9P / 12 OCTOBER 2026 / PLEASE DO NOT
 *    SHARE") and a small tilted "Personal copy" seal top-right on the cover.
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

// Colours from the programs' own design: terracotta (rules, accents) and cream paper.
const TERRACOTTA = rgb(0.70, 0.42, 0.30);
const INK = rgb(0.47, 0.27, 0.18);
const PAPER = rgb(0.992, 0.961, 0.937);
const FOOTER_BASELINE = 13; // points above the bottom edge, below the page's own footer
const SIDE_MARGIN = 24;
const LETTER_SPACING = 0.55; // like the programs' small spaced capitals

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

type DrawOptions = { opacity?: number; color?: ReturnType<typeof rgb>; spacing?: number; angle?: number };

/** Width of text including letter spacing. */
const widthOf = (value: string, font: PDFFont, size: number, spacing = 0) =>
  font.widthOfTextAtSize(value, size) + spacing * Math.max(0, [...value].length - 1);

/** Draws text at view position (x, y); `angle` tilts it (degrees, counter-clockwise). */
function text(page: PDFPage, view: View, value: string, x: number, y: number, font: PDFFont, size: number, options: DrawOptions = {}) {
  const spacing = options.spacing ?? 0;
  if (spacing) page.pushOperators(setCharacterSpacing(spacing));
  page.drawText(value, {
    ...view.at(x, y),
    rotate: degrees(view.rotate.angle + (options.angle ?? 0)),
    font,
    size,
    color: options.color ?? INK,
    opacity: options.opacity ?? 1,
  });
  if (spacing) page.pushOperators(setCharacterSpacing(0));
}

/**
 * One line of small spaced capitals, centred under the page's own footer, in
 * the programs' style: "PERSONAL COPY FOR JANE SMITH / ORDER TV-7K4Q9P / ...".
 * The longest wording that fits the page is used.
 */
function drawFooter(page: PDFPage, view: View, lines: string[], font: PDFFont) {
  const available = view.width - SIDE_MARGIN * 2;
  let size = 5.6;
  let line = lines[lines.length - 1]!;
  pick: for (const candidate of lines) {
    for (size = 5.6; size >= 4.6; size -= 0.2) {
      if (widthOf(candidate, font, size, LETTER_SPACING) <= available) {
        line = candidate;
        break pick;
      }
    }
  }
  if (widthOf(line, font, size, LETTER_SPACING) > available) line = fit(line, font, size, available - LETTER_SPACING * line.length);
  const width = widthOf(line, font, size, LETTER_SPACING);
  text(page, view, line, (view.width - width) / 2, FOOTER_BASELINE, font, size, { color: TERRACOTTA, spacing: LETTER_SPACING });
}

/**
 * A small rubber-stamp seal in the empty top-right corner of the cover,
 * slightly tilted like the "Volume" seals on the website: double ring,
 * "PERSONAL COPY", the buyer's name and the purchase date.
 */
function drawSeal(page: PDFPage, view: View, name: string, date: string, fonts: { regular: PDFFont; semibold: PDFFont }) {
  const radius = Math.max(22, Math.min(31, view.width * 0.052));
  const cx = view.width - radius - 26;
  const cy = view.height - radius - 22;
  const tilt = -9;
  const turn = (tilt * Math.PI) / 180;
  // A point `dx, dy` from the centre, turned with the seal.
  const from = (dx: number, dy: number) => ({ x: cx + dx * Math.cos(turn) - dy * Math.sin(turn), y: cy + dx * Math.sin(turn) + dy * Math.cos(turn) });
  const centred = (value: string, dy: number, font: PDFFont, size: number, options: DrawOptions = {}) => {
    const start = from(-widthOf(value, font, size, options.spacing) / 2, dy);
    text(page, view, value, start.x, start.y, font, size, { ...options, angle: tilt });
  };

  const centre = view.at(cx, cy);
  page.drawCircle({ ...centre, size: radius, color: PAPER, opacity: 0.92, borderColor: TERRACOTTA, borderWidth: 1.2 });
  page.drawCircle({ ...centre, size: radius - 2.6, borderColor: TERRACOTTA, borderWidth: 0.45 });

  const inner = radius * 1.42;
  centred('PERSONAL COPY', radius * 0.3, fonts.semibold, radius * 0.125, { color: TERRACOTTA, spacing: radius * 0.012 });
  let nameSize = radius * 0.25;
  while (nameSize > radius * 0.15 && fonts.semibold.widthOfTextAtSize(name, nameSize) > inner) nameSize -= 0.2;
  centred(fit(name, fonts.semibold, nameSize, inner), -nameSize * 0.32, fonts.semibold, nameSize, { color: INK });
  centred(date.toUpperCase(), -radius * 0.44, fonts.regular, radius * 0.105, { color: TERRACOTTA, spacing: radius * 0.008 });
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
  const owner = (name ? `Personal copy for ${name}` : 'Personal copy').toUpperCase();
  const when = date.toUpperCase();
  // Longest first; the footer uses the first that fits the page.
  const lines = [
    `${owner} / ORDER ${order} / ${when} / PLEASE DO NOT SHARE`,
    `${owner} / ORDER ${order} / ${when}`,
    `${owner} / ORDER ${order}`,
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
