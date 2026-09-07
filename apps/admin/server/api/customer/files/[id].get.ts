import { programAccess, programFiles } from '@tilana/db/schema';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { requireCustomer } from '../../../utils/customer-auth';
import { getDatabase } from '../../../utils/database';
import { parseDatabaseId } from '../../../utils/database-id';
import { createSignedProgramDownload } from '../../../utils/r2';

export default defineEventHandler(async (event) => {
  const fileId = parseDatabaseId(getRouterParam(event, 'id'));
  if (!fileId) throw createError({ statusCode: 400, statusMessage: 'Invalid program file.' });
  const customer = await requireCustomer(event);
  const now = new Date();

  const [file] = await getDatabase()
    .select({ bucket: programFiles.r2Bucket, objectKey: programFiles.r2ObjectKey })
    .from(programFiles)
    .innerJoin(programAccess, eq(programAccess.programVolumeId, programFiles.programVolumeId))
    .where(and(
      eq(programFiles.id, fileId),
      eq(programFiles.isActive, true),
      eq(programAccess.clientId, customer.clientId),
      eq(programAccess.status, 'active'),
      or(isNull(programAccess.expiresAt), sql`${programAccess.expiresAt} > ${now}`),
    ))
    .limit(1);

  if (!file) throw createError({ statusCode: 404, statusMessage: 'Program file not found.' });
  const url = await createSignedProgramDownload(file.bucket, file.objectKey);
  return sendRedirect(event, url, 302);
});
