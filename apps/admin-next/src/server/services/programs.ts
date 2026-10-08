import 'server-only';
import { and, asc, count, eq, isNotNull, like, max, ne, or } from 'drizzle-orm';
import { slugify } from '@tilana/contracts/blog';
import { programs, volumes, type Database, type Program, type Volume } from '@tilana/db';

/*
 * Volumes hold programs: Volume 1 → Beginner, Nourish, ...
 * A program is on the website when it and its volume are switched on and it has a PDF.
 */

export type ProgramInVolume = Program & { volume: Volume };

/** "Beginner · Volume 1": the name in the basket, emails and the PDF's file name. */
export const programLabel = (programName: string, volume: Pick<Volume, 'name'>) => `${programName} · ${volume.name}`;

/** Whether the website shows it right now. */
export const isOnWebsite = (program: Pick<Program, 'filePath' | 'isActive'>, volume: Pick<Volume, 'isActive'>) =>
  volume.isActive && program.isActive && program.filePath !== null;

/** Why a program is not on the website, or null when it is. */
export function offWebsiteReason(program: Pick<Program, 'filePath' | 'isActive'>, volume: Pick<Volume, 'isActive' | 'name'>): string | null {
  if (!program.isActive) return 'Switch it on to show it on the website.';
  if (!program.filePath) return 'Upload the PDF to show it on the website.';
  if (!volume.isActive) return `${volume.name} is switched off.`;
  return null;
}

/** A unique program slug: "beginner-volume-1", then "beginner-volume-1-2", ... */
export async function uniqueProgramSlug(db: Database, name: string, volumeNumber: number, exceptId?: number): Promise<string> {
  const root = `${slugify(name).slice(0, 44).replace(/-+$/g, '') || 'program'}-volume-${volumeNumber}`;
  const rows = await db.select({ slug: programs.slug }).from(programs).where(and(
    or(eq(programs.slug, root), like(programs.slug, `${root}-%`)),
    exceptId ? ne(programs.id, exceptId) : undefined,
  ));
  const taken = new Set(rows.map(row => row.slug));
  if (!taken.has(root)) return root;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${root}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/* ── Volumes ── */

/** Every volume with how many programs it holds and how many have a PDF. */
export async function listVolumes(db: Database) {
  const rows = await db.select().from(volumes).orderBy(asc(volumes.number));
  const totals = await db.select({ volumeId: programs.volumeId, total: count() }).from(programs).groupBy(programs.volumeId);
  const ready = await db.select({ volumeId: programs.volumeId, total: count() }).from(programs)
    .where(isNotNull(programs.filePath)).groupBy(programs.volumeId);
  const live = await db.select({ volumeId: programs.volumeId, total: count() }).from(programs)
    .where(and(isNotNull(programs.filePath), eq(programs.isActive, true))).groupBy(programs.volumeId);
  const totalOf = (list: typeof totals, id: number) => list.find(row => row.volumeId === id)?.total ?? 0;
  return rows.map(volume => ({
    ...volume,
    programCount: totalOf(totals, volume.id),
    readyCount: totalOf(ready, volume.id),
    liveCount: totalOf(live, volume.id),
  }));
}

export async function findVolume(db: Database, id: number): Promise<Volume | undefined> {
  const [row] = await db.select().from(volumes).where(eq(volumes.id, id));
  return row;
}

/** The next free volume number: 1, 2, 3, ... */
export async function nextVolumeNumber(db: Database): Promise<number> {
  const [row] = await db.select({ highest: max(volumes.number) }).from(volumes);
  return (row?.highest ?? 0) + 1;
}

export function toAdminVolume(volume: Volume & { programCount?: number; readyCount?: number; liveCount?: number }) {
  return {
    id: volume.id,
    number: volume.number,
    name: volume.name,
    isActive: volume.isActive,
    programCount: volume.programCount ?? 0,
    readyCount: volume.readyCount ?? 0,
    // Programs that are on the website whenever the volume is switched on.
    liveCount: volume.liveCount ?? 0,
    updatedAt: volume.updatedAt,
  };
}

/* ── Programs ── */

/** The programs in one volume, in website order. */
export async function listVolumePrograms(db: Database, volume: Volume): Promise<ProgramInVolume[]> {
  const rows = await db.select().from(programs).where(eq(programs.volumeId, volume.id))
    .orderBy(asc(programs.sortOrder), asc(programs.name));
  return rows.map(program => ({ ...program, volume }));
}

export async function findProgram(db: Database, id: number): Promise<ProgramInVolume | undefined> {
  const [row] = await db.select({ program: programs, volume: volumes }).from(programs)
    .innerJoin(volumes, eq(volumes.id, programs.volumeId)).where(eq(programs.id, id));
  return row && { ...row.program, volume: row.volume };
}

/** Admin view of a program. The PDF's storage key stays on the server. */
export function toAdminProgram(program: ProgramInVolume) {
  return {
    id: program.id,
    slug: program.slug,
    name: program.name,
    title: program.title,
    summary: program.summary,
    description: program.description,
    audience: program.audience,
    tags: program.tags,
    tone: program.tone,
    illustration: program.illustration,
    series: program.series,
    step: program.step,
    marker: program.marker,
    sortOrder: program.sortOrder,
    isActive: program.isActive,
    priceCents: program.priceCents,
    label: programLabel(program.name, program.volume),
    volume: { id: program.volume.id, number: program.volume.number, name: program.volume.name, isActive: program.volume.isActive },
    onWebsite: isOnWebsite(program, program.volume),
    offWebsiteReason: offWebsiteReason(program, program.volume),
    file: program.filePath
      ? {
          name: program.fileName,
          sizeBytes: program.fileSizeBytes,
          version: program.fileVersion,
          uploadedAt: program.fileUploadedAt,
        }
      : null,
    updatedAt: program.updatedAt,
  };
}

/* ── Website ── */

/** What the website shows: switched-on programs with a PDF in an active volume, oldest volume first. */
export async function listWebsitePrograms(db: Database): Promise<ProgramInVolume[]> {
  const rows = await db.select({ program: programs, volume: volumes }).from(programs)
    .innerJoin(volumes, eq(volumes.id, programs.volumeId))
    .where(and(eq(volumes.isActive, true), eq(programs.isActive, true), isNotNull(programs.filePath)))
    .orderBy(asc(volumes.number), asc(programs.sortOrder), asc(programs.name));
  return rows.map(row => ({ ...row.program, volume: row.volume }));
}

/** Public website view of a program. No file details or internal IDs. */
export function toPublicProgram(program: ProgramInVolume) {
  return {
    slug: program.slug,
    name: program.name,
    title: program.title,
    summary: program.summary,
    description: program.description,
    audience: program.audience,
    tags: program.tags,
    tone: program.tone,
    illustration: program.illustration,
    series: program.series,
    step: program.step,
    marker: program.marker,
    volumeNumber: program.volume.number,
    priceCents: program.priceCents,
    currency: 'ZAR' as const,
  };
}

/** A program by its public slug (for the basket and checkout). */
export async function findProgramBySlug(db: Database, slug: string): Promise<ProgramInVolume | undefined> {
  const [row] = await db.select({ program: programs, volume: volumes }).from(programs)
    .innerJoin(volumes, eq(volumes.id, programs.volumeId)).where(eq(programs.slug, slug));
  return row && { ...row.program, volume: row.volume };
}
