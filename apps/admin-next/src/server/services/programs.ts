import 'server-only';
import { and, asc, eq, inArray, like, ne, or } from 'drizzle-orm';
import { slugify } from '@tilana/contracts/blog';
import { programs, programVolumes, type Database, type Program, type ProgramVolume } from '@tilana/db';

export type ProgramWithVolumes = Program & { volumes: ProgramVolume[] };

/** Volume slugs follow the program: "move" → "move-volume-1". */
export const volumeSlug = (programSlug: string, volumeNumber: number) => `${programSlug}-volume-${volumeNumber}`;

/** "Beginner · Volume 1". */
export const volumeName = (programName: string, volumeNumber: number) => `${programName} · Volume ${volumeNumber}`;

/** A unique program slug based on the name: "nourish", then "nourish-2", ... */
export async function uniqueProgramSlug(db: Database, base: string, exceptId?: number): Promise<string> {
  const root = slugify(base).slice(0, 50).replace(/-+$/g, '') || 'program';
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

async function attachVolumes(db: Database, rows: Program[]): Promise<ProgramWithVolumes[]> {
  if (!rows.length) return [];
  const volumes = await db.select().from(programVolumes)
    .where(inArray(programVolumes.programId, rows.map(row => row.id)))
    .orderBy(asc(programVolumes.volumeNumber));
  return rows.map(row => ({ ...row, volumes: volumes.filter(volume => volume.programId === row.id) }));
}

/** Every program with its volumes, in website order. */
export async function listPrograms(db: Database): Promise<ProgramWithVolumes[]> {
  const rows = await db.select().from(programs).orderBy(asc(programs.sortOrder), asc(programs.name));
  return attachVolumes(db, rows);
}

export async function findProgram(db: Database, id: number): Promise<ProgramWithVolumes | undefined> {
  const [row] = await db.select().from(programs).where(eq(programs.id, id));
  if (!row) return undefined;
  return (await attachVolumes(db, [row]))[0];
}

export async function findVolume(db: Database, id: number): Promise<ProgramVolume | undefined> {
  const [row] = await db.select().from(programVolumes).where(eq(programVolumes.id, id));
  return row;
}

/** Reasons a program cannot be on the website yet; empty when it is ready. */
export function publishProblems(
  program: Pick<Program, 'name' | 'title' | 'summary' | 'description'>,
  volumes: Pick<ProgramVolume, 'isAvailable'>[],
): string[] {
  const problems: string[] = [];
  if (!program.title.trim()) problems.push('Add a headline.');
  if (program.summary.trim().length < 10) problems.push('Add a short summary for the cards.');
  if (program.description.trim().length < 30) problems.push('Add a description.');
  if (!volumes.some(volume => volume.isAvailable)) problems.push('Put at least one volume up for sale (it needs a PDF).');
  return problems;
}

/** The next free volume number for a program. */
export function nextVolumeNumber(volumes: Pick<ProgramVolume, 'volumeNumber'>[]): number {
  return volumes.reduce((max, volume) => Math.max(max, volume.volumeNumber), 0) + 1;
}

/** Admin view of a program and its volumes. File paths stay on the server. */
export function toAdminProgram(program: ProgramWithVolumes) {
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
    status: program.status,
    publishedAt: program.publishedAt,
    updatedAt: program.updatedAt,
    volumes: program.volumes.map(volume => ({
      id: volume.id,
      slug: volume.slug,
      volumeNumber: volume.volumeNumber,
      name: volume.name,
      priceCents: volume.priceCents,
      isAvailable: volume.isAvailable,
      file: volume.filePath
        ? {
            name: volume.fileName,
            sizeBytes: volume.fileSizeBytes,
            version: volume.fileVersion,
            uploadedAt: volume.fileUploadedAt,
          }
        : null,
    })),
  };
}
