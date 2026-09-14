import type {
  AdminProgramCreateRequest,
  AdminProgramStatusRequest,
  AdminProgramUpdateRequest,
  AdminProgramVolumeCreateRequest,
  AdminProgramVolumeUpdateRequest,
} from '@tilana/contracts/catalogue';
import type { Database } from '@tilana/db/server';
import {
  orderItems,
  orders,
  programAccess,
  programAuditEvents,
  programFiles,
  programMedia,
  programs,
  programVolumes,
} from '@tilana/db/schema';
import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { getDatabase } from '../utils/database';
import { getCatalogueStorageConfiguration } from '../utils/r2';
import {
  getCataloguePublicationIssues,
  getProgramVolumeAuditEvents,
  getVolumePublicationIssues,
  publicObjectUrl,
  requiresPurchasedVolumeSlugRedirect,
  type CataloguePublicationCandidate,
  type CataloguePublicationIssue,
} from './catalogue-policy';

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export class CatalogueNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogueNotFoundError';
  }
}

export class CatalogueConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CatalogueConflictError';
  }
}

export class CataloguePublicationError extends Error {
  readonly issues: CataloguePublicationIssue[];

  constructor(issues: CataloguePublicationIssue[]) {
    super('The program is not ready to publish.');
    this.name = 'CataloguePublicationError';
    this.issues = issues;
  }
}

function optionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value?.trim() || null;
}

export async function addProgramAuditEvent(
  transaction: DatabaseTransaction,
  userId: number,
  entityType: 'program' | 'program_volume' | 'program_media' | 'program_file',
  entityId: number,
  action: string,
  changeSummary: Record<string, unknown>,
) {
  await transaction.insert(programAuditEvents).values({
    userId,
    entityType,
    entityId,
    action,
    changeSummary,
  });
}

async function loadPublicationCandidate(
  transaction: DatabaseTransaction,
  programId: number,
): Promise<CataloguePublicationCandidate | null> {
  const storage = getCatalogueStorageConfiguration();
  const [program] = await transaction
    .select({
      cardLabel: programs.cardLabel,
      headline: programs.headline,
      description: programs.description,
      accent: programs.accent,
    })
    .from(programs)
    .where(eq(programs.id, programId))
    .limit(1);

  if (!program) return null;

  const [cover] = await transaction
    .select({ id: programMedia.id })
    .from(programMedia)
    .where(and(
      eq(programMedia.programId, programId),
      eq(programMedia.kind, 'cover'),
      eq(programMedia.uploadStatus, 'ready'),
      eq(programMedia.isActive, true),
      eq(programMedia.r2Bucket, storage.publicMediaBucket),
    ))
    .limit(1);

  const volumeRows = await transaction
    .select({
      id: programVolumes.id,
      slug: programVolumes.slug,
      name: programVolumes.name,
      isPublished: programVolumes.isPublished,
      priceCents: programVolumes.currentPriceCents,
      currency: programVolumes.currency,
    })
    .from(programVolumes)
    .where(eq(programVolumes.programId, programId))
    .orderBy(asc(programVolumes.sortOrder), asc(programVolumes.volumeNumber));

  const readyFileVolumeIds = new Set<number>();
  if (volumeRows.length > 0) {
    const readyFiles = await transaction
      .select({ volumeId: programFiles.programVolumeId })
      .from(programFiles)
      .where(and(
        inArray(programFiles.programVolumeId, volumeRows.map(volume => volume.id)),
        eq(programFiles.uploadStatus, 'ready'),
        eq(programFiles.isActive, true),
        eq(programFiles.r2Bucket, storage.privateProgramBucket),
      ));
    readyFiles.forEach(file => readyFileVolumeIds.add(file.volumeId));
  }

  return {
    ...program,
    hasReadyCover: Boolean(cover),
    volumes: volumeRows.map(volume => ({
      ...volume,
      hasReadyFile: readyFileVolumeIds.has(volume.id),
    })),
  };
}

export async function assertPublishedProgramRemainsValid(
  transaction: DatabaseTransaction,
  programId: number,
) {
  const [program] = await transaction
    .select({ status: programs.status })
    .from(programs)
    .where(eq(programs.id, programId))
    .limit(1);
  if (program?.status !== 'published') return;

  const candidate = await loadPublicationCandidate(transaction, programId);
  if (!candidate) throw new CatalogueNotFoundError('Program not found.');
  const issues = getCataloguePublicationIssues(candidate);
  if (issues.length > 0) throw new CataloguePublicationError(issues);
}

export async function listAdminPrograms() {
  const database = getDatabase();
  const storage = getCatalogueStorageConfiguration();
  const programRows = await database
    .select()
    .from(programs)
    .orderBy(asc(programs.sortOrder), asc(programs.name));

  if (programRows.length === 0) return [];
  const programIds = programRows.map(program => program.id);
  const volumeRows = await database
    .select()
    .from(programVolumes)
    .where(inArray(programVolumes.programId, programIds))
    .orderBy(asc(programVolumes.sortOrder), asc(programVolumes.volumeNumber));
  const volumeIds = volumeRows.map(volume => volume.id);
  const now = new Date();

  const [mediaRows, fileRows, salesRows, accessRows] = await Promise.all([
    database
      .select({
        id: programMedia.id,
        programId: programMedia.programId,
        kind: programMedia.kind,
        displayName: programMedia.displayName,
        altText: programMedia.altText,
        contentType: programMedia.contentType,
        sizeBytes: programMedia.sizeBytes,
        width: programMedia.width,
        height: programMedia.height,
        version: programMedia.version,
        sortOrder: programMedia.sortOrder,
        uploadStatus: programMedia.uploadStatus,
        isActive: programMedia.isActive,
        bucket: programMedia.r2Bucket,
        objectKey: programMedia.r2ObjectKey,
        createdAt: programMedia.createdAt,
      })
      .from(programMedia)
      .where(inArray(programMedia.programId, programIds))
      .orderBy(desc(programMedia.createdAt)),
    volumeIds.length === 0
      ? Promise.resolve([])
      : database
          .select({
            id: programFiles.id,
            programVolumeId: programFiles.programVolumeId,
            displayName: programFiles.displayName,
            originalFilename: programFiles.originalFilename,
            contentType: programFiles.contentType,
            sizeBytes: programFiles.sizeBytes,
            uploadStatus: programFiles.uploadStatus,
            etag: programFiles.etag,
            version: programFiles.version,
            sortOrder: programFiles.sortOrder,
            isActive: programFiles.isActive,
            createdAt: programFiles.createdAt,
          })
          .from(programFiles)
          .where(inArray(programFiles.programVolumeId, volumeIds))
          .orderBy(asc(programFiles.sortOrder), desc(programFiles.version)),
    volumeIds.length === 0
      ? Promise.resolve([])
      : database
          .select({
            volumeId: orderItems.programVolumeId,
            saleCount: sql<number>`count(${orderItems.id})::int`,
            grossCents: sql<number>`coalesce(sum(${orderItems.lineTotalCents}), 0)::int`,
          })
          .from(orderItems)
          .innerJoin(orders, eq(orders.id, orderItems.orderId))
          .where(and(
            inArray(orderItems.programVolumeId, volumeIds),
            inArray(orders.status, ['paid', 'refunded']),
          ))
          .groupBy(orderItems.programVolumeId),
    volumeIds.length === 0
      ? Promise.resolve([])
      : database
          .select({
            volumeId: programAccess.programVolumeId,
            accessCount: sql<number>`count(${programAccess.id})::int`,
          })
          .from(programAccess)
          .where(and(
            inArray(programAccess.programVolumeId, volumeIds),
            eq(programAccess.status, 'active'),
            or(isNull(programAccess.expiresAt), gt(programAccess.expiresAt, now)),
          ))
          .groupBy(programAccess.programVolumeId),
  ]);

  const mediaByProgram = new Map<number, typeof mediaRows>();
  for (const media of mediaRows) {
    const values = mediaByProgram.get(media.programId) ?? [];
    values.push(media);
    mediaByProgram.set(media.programId, values);
  }
  const filesByVolume = new Map<number, typeof fileRows>();
  for (const file of fileRows) {
    const values = filesByVolume.get(file.programVolumeId) ?? [];
    values.push(file);
    filesByVolume.set(file.programVolumeId, values);
  }
  const salesByVolume = new Map(salesRows.map(row => [row.volumeId, row]));
  const accessByVolume = new Map(accessRows.map(row => [row.volumeId, row.accessCount]));

  return programRows.map(program => {
    const volumes = volumeRows
      .filter(volume => volume.programId === program.id)
      .map(volume => ({
        ...volume,
        files: filesByVolume.get(volume.id) ?? [],
        salesCount: salesByVolume.get(volume.id)?.saleCount ?? 0,
        grossSalesCents: salesByVolume.get(volume.id)?.grossCents ?? 0,
        accessCount: accessByVolume.get(volume.id) ?? 0,
      }));
    const media = (mediaByProgram.get(program.id) ?? []).map(item => ({
      id: item.id,
      kind: item.kind,
      displayName: item.displayName,
      altText: item.altText,
      contentType: item.contentType,
      sizeBytes: item.sizeBytes,
      width: item.width,
      height: item.height,
      version: item.version,
      sortOrder: item.sortOrder,
      uploadStatus: item.uploadStatus,
      isActive: item.isActive,
      createdAt: item.createdAt,
      publicUrl: item.uploadStatus === 'ready' && item.isActive && item.bucket === storage.publicMediaBucket
        ? publicObjectUrl(storage.publicMediaBaseUrl, item.objectKey)
        : null,
    }));

    return {
      ...program,
      media,
      volumes,
      salesCount: volumes.reduce((total, volume) => total + volume.salesCount, 0),
      grossSalesCents: volumes.reduce((total, volume) => total + volume.grossSalesCents, 0),
      accessCount: volumes.reduce((total, volume) => total + volume.accessCount, 0),
    };
  });
}

export async function getAdminProgram(programId: number) {
  return (await listAdminPrograms()).find(program => program.id === programId) ?? null;
}

export async function getProgramPublicationChecklist(programId: number) {
  return getDatabase().transaction(async (transaction) => {
    const candidate = await loadPublicationCandidate(transaction, programId);
    if (!candidate) return null;
    const issues = getCataloguePublicationIssues(candidate);
    return { ready: issues.length === 0, issues };
  });
}

export async function createProgram(input: AdminProgramCreateRequest, userId: number) {
  return getDatabase().transaction(async (transaction) => {
    const [duplicate] = await transaction
      .select({ id: programs.id })
      .from(programs)
      .where(eq(programs.slug, input.slug))
      .limit(1);
    if (duplicate) throw new CatalogueConflictError('A program already uses this slug.');

    const [program] = await transaction
      .insert(programs)
      .values({
        slug: input.slug,
        name: input.name,
        cardLabel: optionalText(input.cardLabel),
        headline: optionalText(input.headline),
        description: optionalText(input.description),
        accent: optionalText(input.accent),
        sortOrder: input.sortOrder,
        status: 'draft',
        createdByUserId: userId,
        updatedByUserId: userId,
      })
      .returning();
    if (!program) throw new Error('The program was not created.');

    await addProgramAuditEvent(transaction, userId, 'program', program.id, 'created', {
      slug: program.slug,
      status: program.status,
    });
    return program;
  });
}

export async function updateProgram(
  programId: number,
  input: AdminProgramUpdateRequest,
  userId: number,
) {
  return getDatabase().transaction(async (transaction) => {
    const [existing] = await transaction.select().from(programs).where(eq(programs.id, programId)).limit(1);
    if (!existing) throw new CatalogueNotFoundError('Program not found.');
    if (input.slug && input.slug !== existing.slug) {
      const [duplicate] = await transaction
        .select({ id: programs.id })
        .from(programs)
        .where(and(eq(programs.slug, input.slug), ne(programs.id, programId)))
        .limit(1);
      if (duplicate) throw new CatalogueConflictError('A program already uses this slug.');
    }

    const [program] = await transaction
      .update(programs)
      .set({
        slug: input.slug,
        name: input.name,
        cardLabel: optionalText(input.cardLabel),
        headline: optionalText(input.headline),
        description: optionalText(input.description),
        accent: optionalText(input.accent),
        sortOrder: input.sortOrder,
        updatedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(eq(programs.id, programId))
      .returning();
    if (!program) throw new Error('The program was not updated.');

    await assertPublishedProgramRemainsValid(transaction, programId);
    await addProgramAuditEvent(transaction, userId, 'program', programId, 'updated', {
      fields: Object.keys(input),
    });
    return program;
  });
}

export async function createProgramVolume(
  programId: number,
  input: AdminProgramVolumeCreateRequest,
  userId: number,
) {
  return getDatabase().transaction(async (transaction) => {
    const [program] = await transaction.select({ id: programs.id }).from(programs).where(eq(programs.id, programId)).limit(1);
    if (!program) throw new CatalogueNotFoundError('Program not found.');
    if (input.isPublished) {
      throw new CatalogueConflictError('Create the volume as a draft, upload its PDF, and then publish it.');
    }
    if (input.slug) {
      const [duplicate] = await transaction.select({ id: programVolumes.id }).from(programVolumes).where(eq(programVolumes.slug, input.slug)).limit(1);
      if (duplicate) throw new CatalogueConflictError('A volume already uses this slug.');
    }
    const [duplicateNumber] = await transaction
      .select({ id: programVolumes.id })
      .from(programVolumes)
      .where(and(
        eq(programVolumes.programId, programId),
        eq(programVolumes.volumeNumber, input.volumeNumber),
      ))
      .limit(1);
    if (duplicateNumber) {
      throw new CatalogueConflictError('This program already has that volume number.');
    }

    const [volume] = await transaction
      .insert(programVolumes)
      .values({
        programId,
        slug: optionalText(input.slug),
        volumeNumber: input.volumeNumber,
        name: input.name,
        description: optionalText(input.description),
        currentPriceCents: input.currentPriceCents,
        currency: input.currency,
        sortOrder: input.sortOrder,
        isPublished: false,
        createdByUserId: userId,
        updatedByUserId: userId,
      })
      .returning();
    if (!volume) throw new Error('The program volume was not created.');

    await addProgramAuditEvent(transaction, userId, 'program_volume', volume.id, 'created', {
      programId,
      slug: volume.slug,
      priceCents: volume.currentPriceCents,
      currency: volume.currency,
    });
    return volume;
  });
}

export async function updateProgramVolume(
  volumeId: number,
  input: AdminProgramVolumeUpdateRequest,
  userId: number,
) {
  return getDatabase().transaction(async (transaction) => {
    const [existing] = await transaction.select().from(programVolumes).where(eq(programVolumes.id, volumeId)).limit(1);
    if (!existing) throw new CatalogueNotFoundError('Program volume not found.');

    if (input.slug !== undefined && input.slug !== existing.slug) {
      const nextSlug = optionalText(input.slug) ?? null;
      const [purchase] = await transaction
        .select({ id: orderItems.id })
        .from(orderItems)
        .where(eq(orderItems.programVolumeId, volumeId))
        .limit(1);
      if (requiresPurchasedVolumeSlugRedirect(existing.slug, nextSlug, Boolean(purchase))) {
        throw new CatalogueConflictError('A purchased volume slug cannot be changed without a redirect strategy.');
      }
      if (nextSlug) {
        const [duplicate] = await transaction
          .select({ id: programVolumes.id })
          .from(programVolumes)
          .where(and(eq(programVolumes.slug, nextSlug), ne(programVolumes.id, volumeId)))
          .limit(1);
        if (duplicate) throw new CatalogueConflictError('A volume already uses this slug.');
      }
    }
    if (input.volumeNumber !== undefined && input.volumeNumber !== existing.volumeNumber) {
      const [duplicateNumber] = await transaction
        .select({ id: programVolumes.id })
        .from(programVolumes)
        .where(and(
          eq(programVolumes.programId, existing.programId),
          eq(programVolumes.volumeNumber, input.volumeNumber),
          ne(programVolumes.id, volumeId),
        ))
        .limit(1);
      if (duplicateNumber) {
        throw new CatalogueConflictError('This program already has that volume number.');
      }
    }

    const [volume] = await transaction
      .update(programVolumes)
      .set({
        slug: optionalText(input.slug),
        volumeNumber: input.volumeNumber,
        name: input.name,
        description: optionalText(input.description),
        currentPriceCents: input.currentPriceCents,
        currency: input.currency,
        sortOrder: input.sortOrder,
        isPublished: input.isPublished,
        updatedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(eq(programVolumes.id, volumeId))
      .returning();
    if (!volume) throw new Error('The program volume was not updated.');

    if (volume.isPublished) {
      const storage = getCatalogueStorageConfiguration();
      const [readyFile] = await transaction
        .select({ id: programFiles.id })
        .from(programFiles)
        .where(and(
          eq(programFiles.programVolumeId, volumeId),
          eq(programFiles.uploadStatus, 'ready'),
          eq(programFiles.isActive, true),
          eq(programFiles.r2Bucket, storage.privateProgramBucket),
        ))
        .limit(1);
      const issues = getVolumePublicationIssues({
        id: volume.id,
        slug: volume.slug,
        name: volume.name,
        isPublished: true,
        priceCents: volume.currentPriceCents,
        currency: volume.currency,
        hasReadyFile: Boolean(readyFile),
      });
      if (issues.length > 0) throw new CataloguePublicationError(issues);
    }
    await assertPublishedProgramRemainsValid(transaction, existing.programId);

    for (const event of getProgramVolumeAuditEvents(existing, volume, input)) {
      await addProgramAuditEvent(
        transaction,
        userId,
        'program_volume',
        volume.id,
        event.action,
        event.changeSummary,
      );
    }
    return volume;
  });
}

export async function setProgramStatus(
  programId: number,
  input: AdminProgramStatusRequest,
  userId: number,
) {
  return getDatabase().transaction(async (transaction) => {
    const [existing] = await transaction.select().from(programs).where(eq(programs.id, programId)).limit(1);
    if (!existing) throw new CatalogueNotFoundError('Program not found.');
    if (input.status === 'published') {
      const candidate = await loadPublicationCandidate(transaction, programId);
      if (!candidate) throw new CatalogueNotFoundError('Program not found.');
      const issues = getCataloguePublicationIssues(candidate);
      if (issues.length > 0) throw new CataloguePublicationError(issues);
    }

    const [program] = await transaction
      .update(programs)
      .set({
        status: input.status,
        publishedAt: input.status === 'published' ? existing.publishedAt ?? new Date() : null,
        updatedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(eq(programs.id, programId))
      .returning();
    if (!program) throw new Error('The program status was not updated.');

    const action = input.status === 'published'
      ? 'published'
      : input.status === 'archived'
        ? 'archived'
        : 'unpublished';
    await addProgramAuditEvent(transaction, userId, 'program', programId, action, {
      previousStatus: existing.status,
      status: input.status,
    });
    return program;
  });
}

export function mapCatalogueServiceError(error: unknown) {
  if (error instanceof CatalogueNotFoundError) return { statusCode: 404, statusMessage: error.message };
  if (error instanceof CatalogueConflictError) return { statusCode: 409, statusMessage: error.message };
  if (error instanceof CataloguePublicationError) {
    return { statusCode: 422, statusMessage: error.message, data: { issues: error.issues } };
  }
  return null;
}
