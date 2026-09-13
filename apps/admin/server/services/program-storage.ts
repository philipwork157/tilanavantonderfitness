import type {
  AdminCatalogueDeactivateRequest,
  AdminProgramFileUploadRequest,
  AdminProgramFileUpdateRequest,
  AdminProgramMediaUploadRequest,
  AdminProgramMediaUpdateRequest,
  CatalogueUploadResponse,
} from '@tilana/contracts/catalogue';
import {
  programFiles,
  programMedia,
  programs,
  programVolumes,
} from '@tilana/db/schema';
import { and, eq, ne, sql } from 'drizzle-orm';
import { getDatabase } from '../utils/database';
import {
  createSignedCatalogueUpload,
  ensureCatalogueUploadConfigured,
  getCatalogueStorageConfiguration,
  inspectCatalogueObject,
  R2_UPLOAD_URL_TTL_SECONDS,
} from '../utils/r2';
import {
  buildProgramFileObjectKey,
  buildProgramMediaObjectKey,
  CatalogueStorageVerificationError,
  getProgramFileReplacementIssue,
  verifyUploadedObject,
} from './catalogue-policy';
import {
  addProgramAuditEvent,
  assertPublishedProgramRemainsValid,
  CatalogueConflictError,
  CatalogueNotFoundError,
} from './program-catalogue';

export class CatalogueStorageError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'CatalogueStorageError';
    this.statusCode = statusCode;
  }
}

function isNotFoundStorageError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return value.$metadata?.httpStatusCode === 404 || value.name === 'NotFound' || value.name === 'NoSuchKey';
}

async function markMediaUploadFailed(mediaId: number, userId: number, reason: string) {
  await getDatabase().transaction(async (transaction) => {
    await transaction
      .update(programMedia)
      .set({ uploadStatus: 'failed', updatedAt: new Date() })
      .where(and(eq(programMedia.id, mediaId), eq(programMedia.uploadStatus, 'pending')));
    await addProgramAuditEvent(transaction, userId, 'program_media', mediaId, 'upload_failed', { reason });
  });
}

async function markFileUploadFailed(fileId: number, userId: number, reason: string) {
  await getDatabase().transaction(async (transaction) => {
    await transaction
      .update(programFiles)
      .set({ uploadStatus: 'failed', updatedAt: new Date() })
      .where(and(eq(programFiles.id, fileId), eq(programFiles.uploadStatus, 'pending')));
    await addProgramAuditEvent(transaction, userId, 'program_file', fileId, 'upload_failed', { reason });
  });
}

export async function initiateProgramMediaUpload(
  programId: number,
  input: AdminProgramMediaUploadRequest,
  userId: number,
): Promise<CatalogueUploadResponse> {
  const storage = getCatalogueStorageConfiguration();
  ensureCatalogueUploadConfigured();

  const media = await getDatabase().transaction(async (transaction) => {
    const [program] = await transaction
      .select({ id: programs.id, status: programs.status })
      .from(programs)
      .where(eq(programs.id, programId))
      .limit(1);
    if (!program) throw new CatalogueNotFoundError('Program not found.');
    if (program.status === 'archived') {
      throw new CatalogueConflictError('Archived programs cannot receive new media.');
    }

    const [versionRow] = await transaction
      .select({ value: sql<number>`coalesce(max(${programMedia.version}), 0)::int` })
      .from(programMedia)
      .where(and(eq(programMedia.programId, programId), eq(programMedia.kind, 'cover')));
    const version = (versionRow?.value ?? 0) + 1;
    const placeholderKey = `pending/program-media/${crypto.randomUUID()}`;
    const [reserved] = await transaction
      .insert(programMedia)
      .values({
        programId,
        kind: 'cover',
        displayName: input.displayName,
        altText: input.altText,
        r2Bucket: storage.publicMediaBucket,
        r2ObjectKey: placeholderKey,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        width: input.width,
        height: input.height,
        version,
        uploadStatus: 'pending',
        isActive: true,
        createdByUserId: userId,
      })
      .returning({ id: programMedia.id, version: programMedia.version });
    if (!reserved) throw new Error('The media upload could not be reserved.');

    const objectKey = buildProgramMediaObjectKey(
      programId,
      reserved.id,
      reserved.version,
      input.filename,
      input.contentType,
    );
    await transaction
      .update(programMedia)
      .set({ r2ObjectKey: objectKey, updatedAt: new Date() })
      .where(eq(programMedia.id, reserved.id));
    await addProgramAuditEvent(transaction, userId, 'program_media', reserved.id, 'upload_initiated', {
      programId,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      version,
    });
    return { ...reserved, objectKey };
  });

  try {
    const uploadUrl = await createSignedCatalogueUpload(
      storage.publicMediaBucket,
      media.objectKey,
      input.contentType,
    );
    return {
      uploadId: media.id,
      uploadUrl,
      expiresInSeconds: R2_UPLOAD_URL_TTL_SECONDS,
      headers: { 'Content-Type': input.contentType },
    };
  } catch (error) {
    await markMediaUploadFailed(media.id, userId, 'signing_failed');
    throw error;
  }
}

export async function finalizeProgramMediaUpload(mediaId: number, userId: number) {
  const storage = getCatalogueStorageConfiguration();
  ensureCatalogueUploadConfigured();
  const [media] = await getDatabase()
    .select()
    .from(programMedia)
    .where(eq(programMedia.id, mediaId))
    .limit(1);
  if (!media) throw new CatalogueNotFoundError('Program media not found.');
  if (media.uploadStatus === 'ready') return { id: media.id, status: media.uploadStatus };
  if (media.uploadStatus === 'failed') {
    throw new CatalogueConflictError('This upload has failed. Start a new upload.');
  }
  if (media.r2Bucket !== storage.publicMediaBucket) {
    throw new CatalogueConflictError('This media upload belongs to another environment.');
  }

  let uploadedObject;
  try {
    uploadedObject = await inspectCatalogueObject(media.r2Bucket, media.r2ObjectKey);
  } catch (error) {
    if (isNotFoundStorageError(error)) {
      throw new CatalogueStorageError(409, 'Upload the image to R2 before finalizing it.');
    }
    throw new CatalogueStorageError(503, 'R2 could not verify the image. Please try again.');
  }

  try {
    verifyUploadedObject(
      { contentType: media.contentType, sizeBytes: media.sizeBytes ?? -1 },
      uploadedObject,
    );
  } catch (error) {
    if (error instanceof CatalogueStorageVerificationError) {
      await markMediaUploadFailed(media.id, userId, 'metadata_mismatch');
      throw new CatalogueStorageError(422, error.message);
    }
    throw error;
  }

  return getDatabase().transaction(async (transaction) => {
    await transaction
      .update(programMedia)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(programMedia.programId, media.programId),
        eq(programMedia.kind, media.kind),
        eq(programMedia.uploadStatus, 'ready'),
        eq(programMedia.isActive, true),
        ne(programMedia.id, media.id),
      ));
    const [ready] = await transaction
      .update(programMedia)
      .set({ uploadStatus: 'ready', isActive: true, updatedAt: new Date() })
      .where(and(eq(programMedia.id, media.id), eq(programMedia.uploadStatus, 'pending')))
      .returning({ id: programMedia.id, status: programMedia.uploadStatus });
    if (!ready) throw new CatalogueConflictError('The media upload is no longer pending.');

    await addProgramAuditEvent(transaction, userId, 'program_media', media.id, 'upload_finalized', {
      programId: media.programId,
      version: media.version,
    });
    return ready;
  });
}

export async function deactivateProgramMedia(
  mediaId: number,
  input: AdminCatalogueDeactivateRequest,
  userId: number,
) {
  return getDatabase().transaction(async (transaction) => {
    const [media] = await transaction.select().from(programMedia).where(eq(programMedia.id, mediaId)).limit(1);
    if (!media) throw new CatalogueNotFoundError('Program media not found.');
    if (!media.isActive) return { id: media.id, isActive: false };

    const [updated] = await transaction
      .update(programMedia)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(programMedia.id, mediaId))
      .returning({ id: programMedia.id, isActive: programMedia.isActive });
    await assertPublishedProgramRemainsValid(transaction, media.programId);
    await addProgramAuditEvent(transaction, userId, 'program_media', media.id, 'deactivated', {
      reason: input.reason ?? null,
    });
    return updated;
  });
}

export async function updateProgramMedia(
  mediaId: number,
  input: AdminProgramMediaUpdateRequest,
  userId: number,
) {
  return getDatabase().transaction(async (transaction) => {
    const [media] = await transaction
      .select({ id: programMedia.id, programId: programMedia.programId })
      .from(programMedia)
      .where(eq(programMedia.id, mediaId))
      .limit(1);
    if (!media) throw new CatalogueNotFoundError('Program media not found.');

    const [updated] = await transaction
      .update(programMedia)
      .set({
        displayName: input.displayName,
        altText: input.altText,
        updatedAt: new Date(),
      })
      .where(eq(programMedia.id, mediaId))
      .returning();
    if (!updated) throw new Error('The program media was not updated.');

    await addProgramAuditEvent(transaction, userId, 'program_media', media.id, 'updated', {
      programId: media.programId,
      fields: Object.keys(input),
    });
    return updated;
  });
}

export async function initiateProgramFileUpload(
  volumeId: number,
  input: AdminProgramFileUploadRequest,
  userId: number,
): Promise<CatalogueUploadResponse> {
  const storage = getCatalogueStorageConfiguration();
  ensureCatalogueUploadConfigured();

  const file = await getDatabase().transaction(async (transaction) => {
    const [volume] = await transaction
      .select({
        id: programVolumes.id,
        programId: programVolumes.programId,
        programStatus: programs.status,
      })
      .from(programVolumes)
      .innerJoin(programs, eq(programs.id, programVolumes.programId))
      .where(eq(programVolumes.id, volumeId))
      .limit(1);
    if (!volume) throw new CatalogueNotFoundError('Program volume not found.');
    if (volume.programStatus === 'archived') {
      throw new CatalogueConflictError('Archived programs cannot receive new files.');
    }

    const [versionRow] = await transaction
      .select({ value: sql<number>`coalesce(max(${programFiles.version}), 0)::int` })
      .from(programFiles)
      .where(eq(programFiles.programVolumeId, volumeId));
    const version = (versionRow?.value ?? 0) + 1;
    const placeholderKey = `pending/program-files/${crypto.randomUUID()}`;
    const [reserved] = await transaction
      .insert(programFiles)
      .values({
        programVolumeId: volumeId,
        displayName: input.displayName,
        originalFilename: input.filename,
        r2Bucket: storage.privateProgramBucket,
        r2ObjectKey: placeholderKey,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        uploadStatus: 'pending',
        version,
        sortOrder: input.sortOrder,
        isActive: true,
        uploadedByUserId: userId,
      })
      .returning({ id: programFiles.id, version: programFiles.version });
    if (!reserved) throw new Error('The program file upload could not be reserved.');

    const objectKey = buildProgramFileObjectKey(
      volume.programId,
      volumeId,
      reserved.id,
      reserved.version,
      input.filename,
    );
    await transaction
      .update(programFiles)
      .set({ r2ObjectKey: objectKey, updatedAt: new Date() })
      .where(eq(programFiles.id, reserved.id));
    await addProgramAuditEvent(transaction, userId, 'program_file', reserved.id, 'upload_initiated', {
      programId: volume.programId,
      volumeId,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      version,
    });
    return { ...reserved, objectKey };
  });

  try {
    const uploadUrl = await createSignedCatalogueUpload(
      storage.privateProgramBucket,
      file.objectKey,
      input.contentType,
    );
    return {
      uploadId: file.id,
      uploadUrl,
      expiresInSeconds: R2_UPLOAD_URL_TTL_SECONDS,
      headers: { 'Content-Type': input.contentType },
    };
  } catch (error) {
    await markFileUploadFailed(file.id, userId, 'signing_failed');
    throw error;
  }
}

export async function finalizeProgramFileUpload(
  fileId: number,
  userId: number,
  replaceFileId?: number,
) {
  const storage = getCatalogueStorageConfiguration();
  ensureCatalogueUploadConfigured();
  const [file] = await getDatabase()
    .select()
    .from(programFiles)
    .where(eq(programFiles.id, fileId))
    .limit(1);
  if (!file) throw new CatalogueNotFoundError('Program file not found.');
  if (file.uploadStatus === 'ready') return { id: file.id, status: file.uploadStatus, etag: file.etag };
  if (file.uploadStatus === 'failed') {
    throw new CatalogueConflictError('This upload has failed. Start a new upload.');
  }
  if (file.r2Bucket !== storage.privateProgramBucket) {
    throw new CatalogueConflictError('This file upload belongs to another environment.');
  }

  let uploadedObject;
  try {
    uploadedObject = await inspectCatalogueObject(file.r2Bucket, file.r2ObjectKey);
  } catch (error) {
    if (isNotFoundStorageError(error)) {
      throw new CatalogueStorageError(409, 'Upload the PDF to R2 before finalizing it.');
    }
    throw new CatalogueStorageError(503, 'R2 could not verify the PDF. Please try again.');
  }

  let verified;
  try {
    verified = verifyUploadedObject(
      { contentType: file.contentType, sizeBytes: file.sizeBytes ?? -1 },
      uploadedObject,
    );
  } catch (error) {
    if (error instanceof CatalogueStorageVerificationError) {
      await markFileUploadFailed(file.id, userId, 'metadata_mismatch');
      throw new CatalogueStorageError(422, error.message);
    }
    throw error;
  }

  return getDatabase().transaction(async (transaction) => {
    let replacedFileId: number | null = null;
    if (replaceFileId !== undefined) {
      const [replacement] = await transaction
        .select({
          id: programFiles.id,
          programVolumeId: programFiles.programVolumeId,
          uploadStatus: programFiles.uploadStatus,
          isActive: programFiles.isActive,
        })
        .from(programFiles)
        .where(eq(programFiles.id, replaceFileId))
        .limit(1);
      const issue = getProgramFileReplacementIssue(file, replacement ?? null);
      if (issue === 'not_found') {
        throw new CatalogueNotFoundError('The program file selected for replacement was not found.');
      }
      if (issue === 'same_file') {
        throw new CatalogueConflictError('A program file cannot replace itself.');
      }
      if (issue === 'different_volume') {
        throw new CatalogueConflictError('A replacement must belong to the same program volume.');
      }
      if (issue === 'not_active_ready') {
        throw new CatalogueConflictError('Only a ready, active program file can be replaced.');
      }

      const [deactivated] = await transaction
        .update(programFiles)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(programFiles.id, replaceFileId),
          eq(programFiles.uploadStatus, 'ready'),
          eq(programFiles.isActive, true),
        ))
        .returning({ id: programFiles.id });
      if (!deactivated) {
        throw new CatalogueConflictError('The program file selected for replacement is no longer active.');
      }
      replacedFileId = deactivated.id;
    }

    const [ready] = await transaction
      .update(programFiles)
      .set({ uploadStatus: 'ready', etag: verified.etag, updatedAt: new Date() })
      .where(and(eq(programFiles.id, file.id), eq(programFiles.uploadStatus, 'pending')))
      .returning({ id: programFiles.id, status: programFiles.uploadStatus, etag: programFiles.etag });
    if (!ready) throw new CatalogueConflictError('The program file upload is no longer pending.');

    await addProgramAuditEvent(transaction, userId, 'program_file', file.id, 'upload_finalized', {
      volumeId: file.programVolumeId,
      version: file.version,
      replacedFileId,
    });
    if (replacedFileId !== null) {
      await addProgramAuditEvent(transaction, userId, 'program_file', replacedFileId, 'replaced', {
        volumeId: file.programVolumeId,
        replacementFileId: file.id,
      });
    }
    return ready;
  });
}

export async function deactivateProgramFile(
  fileId: number,
  input: AdminCatalogueDeactivateRequest,
  userId: number,
) {
  return getDatabase().transaction(async (transaction) => {
    const [file] = await transaction
      .select({
        id: programFiles.id,
        programVolumeId: programFiles.programVolumeId,
        isActive: programFiles.isActive,
        programId: programVolumes.programId,
      })
      .from(programFiles)
      .innerJoin(programVolumes, eq(programVolumes.id, programFiles.programVolumeId))
      .where(eq(programFiles.id, fileId))
      .limit(1);
    if (!file) throw new CatalogueNotFoundError('Program file not found.');
    if (!file.isActive) return { id: file.id, isActive: false };

    const [updated] = await transaction
      .update(programFiles)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(programFiles.id, fileId))
      .returning({ id: programFiles.id, isActive: programFiles.isActive });
    await assertPublishedProgramRemainsValid(transaction, file.programId);
    await addProgramAuditEvent(transaction, userId, 'program_file', file.id, 'deactivated', {
      volumeId: file.programVolumeId,
      reason: input.reason ?? null,
    });
    return updated;
  });
}

export async function updateProgramFile(
  fileId: number,
  input: AdminProgramFileUpdateRequest,
  userId: number,
) {
  return getDatabase().transaction(async (transaction) => {
    const [file] = await transaction
      .select({ id: programFiles.id, programVolumeId: programFiles.programVolumeId })
      .from(programFiles)
      .where(eq(programFiles.id, fileId))
      .limit(1);
    if (!file) throw new CatalogueNotFoundError('Program file not found.');

    const [updated] = await transaction
      .update(programFiles)
      .set({
        displayName: input.displayName,
        sortOrder: input.sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(programFiles.id, fileId))
      .returning();
    if (!updated) throw new Error('The program file was not updated.');

    await addProgramAuditEvent(transaction, userId, 'program_file', file.id, 'updated', {
      volumeId: file.programVolumeId,
      fields: Object.keys(input),
    });
    return updated;
  });
}

export function mapCatalogueStorageError(error: unknown) {
  if (error instanceof CatalogueStorageError) {
    return { statusCode: error.statusCode, statusMessage: error.message };
  }
  return null;
}
