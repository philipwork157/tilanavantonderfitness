import 'server-only';
import { createRequire } from 'node:module';
import path from 'node:path';
import sharp from 'sharp';

/*
 * Pictures of a program's PDF for the website's "Peek inside": the cover as it
 * is, plus a few inside pages blurred so buyers see the look and layout but
 * cannot read the plan. Rendered on the server with pdf.js (+ @napi-rs/canvas);
 * the PDF itself never leaves the server.
 */

/** Width the page is drawn at before shrinking: sharper text, then a smaller file. */
const RENDER_WIDTH = 900;
/** Width of the stored images. */
export const PREVIEW_WIDTH = 640;
/** Strong enough that body text and numbers can't be read at this width. */
const BLUR_SIGMA = 4;
/** How many inside pages to show next to the cover. */
const INSIDE_PAGES = 3;
/** Guards against odd page sizes (a very long page would be a huge canvas). */
const MAX_RENDER_HEIGHT = 2400;

export type PreviewImage = { page: number; width: number; height: number; blurred: boolean; data: Buffer };
export type PdfPreview = { pageCount: number; images: PreviewImage[] };

/**
 * Inside pages spread through the PDF (about a quarter, half and three
 * quarters of the way), never the cover. Short PDFs get fewer.
 */
export function insidePageNumbers(pageCount: number, wanted = INSIDE_PAGES): number[] {
  if (pageCount < 2) return [];
  const pages = new Set<number>();
  for (let i = 1; i <= wanted; i += 1) {
    const page = Math.round((pageCount * i) / (wanted + 1));
    pages.add(Math.min(pageCount, Math.max(2, page)));
  }
  return [...pages].sort((a, b) => a - b);
}

/** pdf.js's built-in canvas maker in Node (backed by @napi-rs/canvas). */
type NodeCanvasFactory = {
  create: (width: number, height: number) => { canvas: { toBuffer: (type: 'image/png') => Buffer }; context: CanvasRenderingContext2D };
};
type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type PdfDocument = Awaited<ReturnType<PdfJs['getDocument']>['promise']>;

let pdfjs: Promise<PdfJs> | undefined;
const loadPdfJs = () => (pdfjs ??= import('pdfjs-dist/legacy/build/pdf.mjs'));

/** Folder of the installed pdfjs-dist, for its fonts and character maps. */
function pdfjsFolder(): string {
  const require = createRequire(path.join(process.cwd(), 'package.json'));
  return path.dirname(require.resolve('pdfjs-dist/package.json'));
}

async function renderPage(doc: PdfDocument, pageNumber: number): Promise<Buffer> {
  const page = await doc.getPage(pageNumber);
  try {
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(RENDER_WIDTH / base.width, MAX_RENDER_HEIGHT / base.height);
    const viewport = page.getViewport({ scale });
    const width = Math.max(1, Math.round(viewport.width));
    const height = Math.max(1, Math.round(viewport.height));
    const { canvas, context } = (doc.canvasFactory as NodeCanvasFactory).create(width, height);
    // PDFs may have no background; paper is white.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    await page.render({ canvasContext: context, viewport, canvas: canvas as unknown as HTMLCanvasElement }).promise;
    return canvas.toBuffer('image/png');
  }
  finally {
    page.cleanup();
  }
}

/** A nearly empty page (all one colour) is not worth showing. */
async function isBlank(png: Buffer): Promise<boolean> {
  const { channels } = await sharp(png).stats();
  return channels.slice(0, 3).every(channel => channel.stdev < 2);
}

async function toImage(png: Buffer, page: number, blurred: boolean): Promise<PreviewImage> {
  let image = sharp(png).resize({ width: PREVIEW_WIDTH, withoutEnlargement: true });
  if (blurred) image = image.blur(BLUR_SIGMA);
  const { data, info } = await image.webp({ quality: blurred ? 72 : 80 }).toBuffer({ resolveWithObject: true });
  return { page, width: info.width, height: info.height, blurred, data };
}

/** Renders the cover sharp and a few inside pages blurred. Throws if the PDF can't be read. */
export async function renderPdfPreview(pdf: Buffer): Promise<PdfPreview> {
  const lib = await loadPdfJs();
  const folder = pdfjsFolder();
  const task = lib.getDocument({
    // pdf.js takes ownership of the bytes it is given, so pass a copy.
    data: new Uint8Array(pdf),
    standardFontDataUrl: `${folder}/standard_fonts/`,
    cMapUrl: `${folder}/cmaps/`,
    cMapPacked: true,
    wasmUrl: `${folder}/wasm/`,
  });

  try {
    const doc = await task.promise;
    const pageCount = doc.numPages;
    const images = [await toImage(await renderPage(doc, 1), 1, false)];
    const used = new Set([1]);
    for (const wanted of insidePageNumbers(pageCount)) {
      // A blank page (e.g. a spacer) is swapped for the next one or two.
      for (let page = wanted; page <= Math.min(pageCount, wanted + 2); page += 1) {
        if (used.has(page)) continue;
        const png = await renderPage(doc, page);
        if (await isBlank(png) && page < Math.min(pageCount, wanted + 2)) continue;
        used.add(page);
        images.push(await toImage(png, page, true));
        break;
      }
    }
    return { pageCount, images: images.sort((a, b) => a.page - b.page) };
  }
  finally {
    await task.destroy();
  }
}
