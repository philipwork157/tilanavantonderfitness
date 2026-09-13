import type {
  PublicCatalogueProgram,
  PublicCatalogueVolume,
} from '@tilana/contracts/catalogue';
import { programFiles, programMedia, programs, programVolumes } from '@tilana/db/schema';
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { getDatabase } from '../utils/database';
import { getCatalogueStorageConfiguration } from '../utils/r2';
import { publicObjectUrl } from './catalogue-policy';

export async function listPublicCataloguePrograms(): Promise<PublicCatalogueProgram[]> {
  const database = getDatabase();
  const storage = getCatalogueStorageConfiguration();
  const programRows = await database
    .select({
      id: programs.id,
      slug: programs.slug,
      name: programs.name,
      cardLabel: programs.cardLabel,
      headline: programs.headline,
      description: programs.description,
      accent: programs.accent,
      sortOrder: programs.sortOrder,
    })
    .from(programs)
    .where(and(
      eq(programs.status, 'published'),
      isNotNull(programs.cardLabel),
      isNotNull(programs.headline),
      isNotNull(programs.description),
      isNotNull(programs.accent),
    ))
    .orderBy(asc(programs.sortOrder), asc(programs.name));
  if (programRows.length === 0) return [];

  const programIds = programRows.map(program => program.id);
  const [mediaRows, volumeRows] = await Promise.all([
    database
      .select({
        id: programMedia.id,
        programId: programMedia.programId,
        objectKey: programMedia.r2ObjectKey,
        altText: programMedia.altText,
        width: programMedia.width,
        height: programMedia.height,
      })
      .from(programMedia)
      .where(and(
        inArray(programMedia.programId, programIds),
        eq(programMedia.kind, 'cover'),
        eq(programMedia.uploadStatus, 'ready'),
        eq(programMedia.isActive, true),
        eq(programMedia.r2Bucket, storage.publicMediaBucket),
      )),
    database
      .select({
        id: programVolumes.id,
        programId: programVolumes.programId,
        slug: programVolumes.slug,
        volumeNumber: programVolumes.volumeNumber,
        name: programVolumes.name,
        description: programVolumes.description,
        priceCents: programVolumes.currentPriceCents,
        currency: programVolumes.currency,
        sortOrder: programVolumes.sortOrder,
      })
      .from(programVolumes)
      .where(and(
        inArray(programVolumes.programId, programIds),
        eq(programVolumes.isPublished, true),
        isNotNull(programVolumes.slug),
      ))
      .orderBy(asc(programVolumes.sortOrder), asc(programVolumes.volumeNumber)),
  ]);

  const readyFileVolumeIds = new Set<number>();
  if (volumeRows.length > 0) {
    const files = await database
      .select({ volumeId: programFiles.programVolumeId })
      .from(programFiles)
      .where(and(
        inArray(programFiles.programVolumeId, volumeRows.map(volume => volume.id)),
        eq(programFiles.uploadStatus, 'ready'),
        eq(programFiles.isActive, true),
        eq(programFiles.r2Bucket, storage.privateProgramBucket),
      ));
    files.forEach(file => readyFileVolumeIds.add(file.volumeId));
  }

  const coverByProgram = new Map(mediaRows.map(media => [media.programId, media]));
  const volumesByProgram = new Map<number, PublicCatalogueVolume[]>();
  for (const volume of volumeRows) {
    if (!volume.slug || volume.currency !== 'ZAR') continue;
    const values = volumesByProgram.get(volume.programId) ?? [];
    values.push({
      id: volume.id,
      slug: volume.slug,
      volumeNumber: volume.volumeNumber,
      name: volume.name,
      description: volume.description,
      priceCents: volume.priceCents,
      currency: 'ZAR',
      isAvailable: volume.priceCents > 0 && readyFileVolumeIds.has(volume.id),
    });
    volumesByProgram.set(volume.programId, values);
  }

  const catalogue: PublicCatalogueProgram[] = [];
  for (const program of programRows) {
    const cover = coverByProgram.get(program.id);
    const volumes = volumesByProgram.get(program.id) ?? [];
    if (!cover || !volumes.some(volume => volume.isAvailable)) continue;
    if (!program.cardLabel || !program.headline || !program.description || !program.accent) continue;

    catalogue.push({
      id: program.id,
      slug: program.slug,
      name: program.name,
      cardLabel: program.cardLabel,
      headline: program.headline,
      description: program.description,
      accent: program.accent,
      cover: {
        id: cover.id,
        url: publicObjectUrl(storage.publicMediaBaseUrl, cover.objectKey),
        altText: cover.altText,
        width: cover.width,
        height: cover.height,
      },
      volumes,
    });
  }
  return catalogue;
}

export async function getPublicCatalogueProgram(slug: string) {
  return (await listPublicCataloguePrograms()).find(program => program.slug === slug) ?? null;
}

export async function getPublicCatalogueVolume(slug: string) {
  for (const program of await listPublicCataloguePrograms()) {
    const volume = program.volumes.find(item => item.slug === slug);
    if (volume) return { ...volume, program };
  }
  return null;
}
