/** Sneak peek pictures made from a program's PDF. The database part needs TEST_DATABASE_URL. */
import { fileURLToPath } from 'node:url';
import { eq, inArray, like } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, programs, volumes, type Database, type Volume } from '@tilana/db';
import { makeProgramPreview, type PreviewDeps } from '@/server/services/program-previews';
import { findProgram } from '@/server/services/programs';
import { insidePageNumbers, PREVIEW_WIDTH, renderPdfPreview } from '@/server/utils/pdf-preview';

/** A small A4 PDF: every page has a dark block and its number, so none is blank. */
function makePdf(pageCount: number): Buffer {
  const objects: string[] = [];
  const pageIds = Array.from({ length: pageCount }, (_, i) => 4 + i * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pageIds.forEach((id, i) => {
    const stream = `0.2 0.3 0.4 rg 60 500 475 260 re f BT /F1 36 Tf 0 0 0 rg 72 420 Td (Page ${i + 1}) Tj ET`;
    objects[id] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${id + 1} 0 R >>`;
    objects[id + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = body.length;
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

describe('choosing the pages to show', () => {
  it('spreads inside pages through the PDF and never repeats the cover', () => {
    expect(insidePageNumbers(1)).toEqual([]);
    expect(insidePageNumbers(2)).toEqual([2]);
    expect(insidePageNumbers(4)).toEqual([2, 3]);
    expect(insidePageNumbers(16)).toEqual([4, 8, 12]);
    expect(insidePageNumbers(40)).toEqual([10, 20, 30]);
  });
});

describe('drawing a PDF', () => {
  it('makes a sharp cover and blurred inside pages as small WebP images', async () => {
    const preview = await renderPdfPreview(makePdf(8));
    expect(preview.pageCount).toBe(8);
    expect(preview.images.map(image => [image.page, image.blurred])).toEqual([[1, false], [2, true], [4, true], [6, true]]);
    for (const image of preview.images) {
      const meta = await sharp(image.data).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(PREVIEW_WIDTH);
      expect(image.width).toBe(PREVIEW_WIDTH);
      // A4 keeps its shape.
      expect(image.height / image.width).toBeCloseTo(842 / 595, 1);
    }
  }, 30_000);

  it('rejects a file that is not a readable PDF', async () => {
    await expect(renderPdfPreview(Buffer.from('%PDF-1.4\nnot really\n%%EOF'))).rejects.toThrow();
  });
});

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('saving the sneak peek (database)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let volume: Volume;
  const stored = new Map<string, Buffer>();
  const removed: string[] = [];
  const deps: PreviewDeps = {
    store: {
      upload: async (path, data) => { stored.set(path, data); },
      remove: async (paths) => { removed.push(...paths); },
    },
    render: renderPdfPreview,
    download: async () => makePdf(5),
  };

  beforeAll(async () => {
    ({ db, close } = createDatabase(url!, { max: 1 }));
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../../../packages/db/migrations', import.meta.url)) });
    await db.delete(programs).where(like(programs.slug, 'test-peek-%'));
    await db.delete(volumes).where(inArray(volumes.number, [93]));
    [volume] = await db.insert(volumes).values({ number: 93, name: 'Volume 93', isActive: true }).returning() as [Volume];
  });

  afterAll(async () => {
    await db.delete(programs).where(like(programs.slug, 'test-peek-%'));
    await db.delete(volumes).where(inArray(volumes.number, [93]));
    await close?.();
  });

  const pdf = (version: number) => ({
    filePath: `programs/x/v${version}-abc.pdf`, fileName: 'x.pdf', fileSizeBytes: 10, fileSha256: 'c'.repeat(64), fileVersion: version, fileUploadedAt: new Date(),
  });

  it('stores the pictures, saves them on the program and removes the previous ones', async () => {
    const [row] = await db.insert(programs).values({ volumeId: volume.id, slug: 'test-peek-one', name: 'Peek', priceCents: 39_900, ...pdf(1) }).returning();
    const first = await makeProgramPreview(db, (await findProgram(db, row!.id))!, undefined, deps);
    expect(first).toMatchObject({ fileVersion: 1, pageCount: 5 });
    expect(first!.pages.map(page => page.page)).toEqual([1, 2, 3, 4]);
    expect(first!.pages.every(page => stored.has(page.path) && page.path.startsWith(`programs/${row!.id}/v1-`))).toBe(true);
    expect((await findProgram(db, row!.id))!.preview).toEqual(first);

    // "Make again": new pictures under new names, the old ones are removed.
    const second = await makeProgramPreview(db, (await findProgram(db, row!.id))!, makePdf(3), deps);
    expect(second!.pageCount).toBe(3);
    expect(second!.pages.some(page => first!.pages.some(old => old.path === page.path))).toBe(false);
    expect(removed).toEqual(expect.arrayContaining(first!.pages.map(page => page.path)));
  }, 30_000);

  it('throws away pictures made from a PDF that was replaced meanwhile', async () => {
    const [row] = await db.insert(programs).values({ volumeId: volume.id, slug: 'test-peek-two', name: 'Peek two', priceCents: 39_900, ...pdf(1) }).returning();
    const drawnFrom = (await findProgram(db, row!.id))!;
    await db.update(programs).set(pdf(2)).where(eq(programs.id, row!.id));
    removed.length = 0;
    expect(await makeProgramPreview(db, drawnFrom, makePdf(4), deps)).toBeNull();
    expect((await findProgram(db, row!.id))!.preview).toBeNull();
    expect(removed).toHaveLength(3);
  }, 30_000);
});
