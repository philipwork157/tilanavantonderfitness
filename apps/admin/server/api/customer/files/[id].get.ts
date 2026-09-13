import { programAccess, programFiles } from '@tilana/db/schema';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { requireCustomer } from '../../../utils/customer-auth';
import { getDatabase } from '../../../utils/database';
import { parseDatabaseId } from '../../../utils/database-id';
import { createSignedProgramDownload, getCatalogueStorageConfiguration } from '../../../utils/r2';

export default defineEventHandler(async (event) => {
  const fileId = parseDatabaseId(getRouterParam(event, 'id'));
  if (!fileId) throw createError({ statusCode: 400, statusMessage: 'Invalid program file.' });
  const customer = await requireCustomer(event);
  const storage = getCatalogueStorageConfiguration();
  const now = new Date();

  const [file] = await getDatabase()
    .select({
      bucket: programFiles.r2Bucket,
      objectKey: programFiles.r2ObjectKey,
      displayName: programFiles.displayName,
      originalFilename: programFiles.originalFilename,
    })
    .from(programFiles)
    .innerJoin(programAccess, eq(programAccess.programVolumeId, programFiles.programVolumeId))
    .where(and(
      eq(programFiles.id, fileId),
      eq(programFiles.isActive, true),
      eq(programFiles.uploadStatus, 'ready'),
      eq(programFiles.r2Bucket, storage.privateProgramBucket),
      eq(programAccess.clientId, customer.clientId),
      eq(programAccess.status, 'active'),
      or(isNull(programAccess.expiresAt), sql`${programAccess.expiresAt} > ${now}`),
    ))
    .limit(1);

  if (!file) throw createError({ statusCode: 404, statusMessage: 'Program file not found.' });
  const downloadFilename = file.originalFilename
    ?? (file.displayName.toLowerCase().endsWith('.pdf') ? file.displayName : `${file.displayName}.pdf`);
  const url = await createSignedProgramDownload(
    file.bucket,
    file.objectKey,
    downloadFilename,
  );
  return sendRedirect(event, url, 302);
});
