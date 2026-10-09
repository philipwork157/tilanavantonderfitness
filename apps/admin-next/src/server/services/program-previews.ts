import 'server-only';
import { randomBytes } from 'node:crypto';
import { programs, type Database, type ProgramPreviewData } from '@tilana/db';
import { and, eq } from 'drizzle-orm';
import { logger } from '../logger';
import { renderPdfPreview, type PdfPreview } from '../utils/pdf-preview';
import { downloadProgramFile } from '../utils/program-files';
import { publicStorageUrl, storageClient } from '../utils/storage';
import type { ProgramInVolume } from './programs';

/*
 * The sneak peek on the website is made from the program's PDF, never typed
 * in: the cover plus a few blurred inside pages, stored as public WebP images
 * (bucket `program-previews`). Only these pictures are public; the PDF stays
 * private in R2. A new PDF makes a new peek, and the website only shows a
 * peek made from the current PDF.
 */

const BUCKET = 'program-previews';
const ALLOWED_TYPES = ['image/webp'];

/** Where the pictures go; swapped in tests. */
export type PreviewStore = {
  upload: (path: string, data: Buffer) => Promise<void>;
  remove: (paths: string[]) => Promise<void>;
};

export type PreviewDeps = {
  store: PreviewStore;
  render: (pdf: Buffer) => Promise<PdfPreview>;
  download: (key: string) => Promise<Buffer>;
};

let bucketReady = false;

async function ensureBucket() {
  if (bucketReady) return;
  const storage = storageClient().storage;
  const { data } = await storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await storage.createBucket(BUCKET, { public: true, fileSizeLimit: '2MB', allowedMimeTypes: ALLOWED_TYPES });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
  bucketReady = true;
}

const supabaseStore: PreviewStore = {
  async upload(path, data) {
    await ensureBucket();
    const { error } = await storageClient().storage.from(BUCKET).upload(path, data, {
      contentType: 'image/webp',
      // Every peek gets new file names, so the pictures can be cached for good.
      cacheControl: '31536000',
      upsert: false,
    });
    if (error) throw new Error(`Preview image could not be stored: ${error.message}`);
  },
  async remove(paths) {
    if (!paths.length) return;
    const { error } = await storageClient().storage.from(BUCKET).remove(paths);
    if (error) logger.warn({ count: paths.length, reason: error.message }, 'Could not delete old preview images');
  },
};

const defaultDeps: PreviewDeps = { store: supabaseStore, render: renderPdfPreview, download: downloadProgramFile };

export const previewImageUrl = (path: string) => publicStorageUrl(BUCKET, path);

/** The peek made from the program's current PDF, or null (none yet, or made from an older PDF). */
export function currentPreview(program: Pick<ProgramInVolume, 'preview' | 'fileVersion' | 'filePath'>): ProgramPreviewData | null {
  const { preview } = program;
  return program.filePath && preview && preview.fileVersion === program.fileVersion && preview.pages.length ? preview : null;
}

/** Remove a program's peek pictures, e.g. when the program is deleted. Best effort. */
export async function removePreviewImages(preview: ProgramPreviewData | null, store: PreviewStore = supabaseStore) {
  if (!preview?.pages.length) return;
  try {
    await store.remove(preview.pages.map(page => page.path));
  }
  catch (error) {
    logger.warn({ err: error }, 'Could not delete preview images');
  }
}

// One render per program at a time in this server (two tabs, or an upload and a "Make again").
const running = new Map<number, Promise<ProgramPreviewData | null>>();

/**
 * Makes the peek for the program's current PDF and saves it. Pass the PDF when
 * it is at hand (just uploaded); otherwise it is read from R2. Returns null when
 * the program has no PDF or the PDF was replaced meanwhile (that upload makes
 * its own). Throws when the PDF can't be drawn or the pictures can't be stored.
 */
export function makeProgramPreview(db: Database, program: ProgramInVolume, pdf?: Buffer, deps: PreviewDeps = defaultDeps): Promise<ProgramPreviewData | null> {
  const existing = running.get(program.id);
  if (existing) return existing;
  const job = buildPreview(db, program, pdf, deps).finally(() => running.delete(program.id));
  running.set(program.id, job);
  return job;
}

async function buildPreview(db: Database, program: ProgramInVolume, pdf: Buffer | undefined, deps: PreviewDeps): Promise<ProgramPreviewData | null> {
  if (!program.filePath) return null;
  const version = program.fileVersion;
  const started = Date.now();
  const rendered = await deps.render(pdf ?? await deps.download(program.filePath));

  // New names every time: a replaced PDF never shows old cached pictures.
  const folder = `programs/${program.id}/v${version}-${randomBytes(6).toString('hex')}`;
  const pages: ProgramPreviewData['pages'] = [];
  try {
    for (const image of rendered.images) {
      const path = `${folder}/page-${image.page}${image.blurred ? '-blurred' : ''}.webp`;
      await deps.store.upload(path, image.data);
      pages.push({ path, page: image.page, width: image.width, height: image.height, blurred: image.blurred });
    }
  }
  catch (error) {
    await removePreviewImages({ fileVersion: version, pageCount: rendered.pageCount, pages }, deps.store);
    throw error;
  }
  const preview: ProgramPreviewData = { fileVersion: version, pageCount: rendered.pageCount, pages };

  // Save only if the PDF is still the one we drew, and swap out the old pictures.
  const previous = await db.transaction(async (tx) => {
    const [row] = await tx.select({ preview: programs.preview }).from(programs)
      .where(and(eq(programs.id, program.id), eq(programs.fileVersion, version))).for('update');
    if (!row) return undefined;
    await tx.update(programs).set({ preview }).where(eq(programs.id, program.id));
    return row.preview;
  });
  if (previous === undefined) {
    await removePreviewImages(preview, deps.store);
    return null;
  }
  await removePreviewImages(previous, deps.store);
  logger.info({ programId: program.id, fileVersion: version, pages: pages.length, ms: Date.now() - started }, 'Program preview made');
  return preview;
}
