import { programAccess, programFiles, programs, programVolumes } from '@tilana/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { currentProgramAccess } from '@server/services/program-entitlements';
import { requireCustomer } from '@server/utils/customer-auth';
import { getDatabase } from '@server/utils/database';
import { getCatalogueStorageConfiguration } from '@server/utils/r2';

export default defineEventHandler(async (event) => {
  const customer = await requireCustomer(event);
  const storage = getCatalogueStorageConfiguration();
  const now = new Date();
  const rows = await getDatabase()
    .select({
      accessId: programAccess.id,
      volumeId: programVolumes.id,
      programName: programs.name,
      volumeName: programVolumes.name,
      fileId: programFiles.id,
      fileName: programFiles.displayName,
    })
    .from(programAccess)
    .innerJoin(programVolumes, eq(programVolumes.id, programAccess.programVolumeId))
    .innerJoin(programs, eq(programs.id, programVolumes.programId))
    .leftJoin(programFiles, and(
      eq(programFiles.programVolumeId, programVolumes.id),
      eq(programFiles.isActive, true),
      eq(programFiles.uploadStatus, 'ready'),
      eq(programFiles.r2Bucket, storage.privateProgramBucket),
    ))
    .where(and(
      eq(programAccess.clientId, customer.clientId),
      currentProgramAccess(now),
    ))
    .orderBy(asc(programs.name), asc(programVolumes.volumeNumber), asc(programFiles.sortOrder), asc(programAccess.id));

  const byVolume = new Map<number, { id: number; programName: string; volumeName: string; files: Array<{ id: number; name: string }> }>();
  for (const row of rows) {
    // Multiple independent grants authorize one volume, not duplicate cards/files.
    const item = byVolume.get(row.volumeId) ?? {
      id: row.accessId,
      programName: row.programName,
      volumeName: row.volumeName,
      files: [],
    };
    if (row.fileId && row.fileName && !item.files.some(file => file.id === row.fileId)) item.files.push({ id: row.fileId, name: row.fileName });
    byVolume.set(row.volumeId, item);
  }

  return { customer: { firstName: customer.firstName, email: customer.email }, programs: [...byVolume.values()] };
});
