import { programAccess, programFiles, programs, programVolumes } from '@tilana/db/schema';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { requireCustomer } from '../../utils/customer-auth';
import { getDatabase } from '../../utils/database';

export default defineEventHandler(async (event) => {
  const customer = await requireCustomer(event);
  const now = new Date();
  const rows = await getDatabase()
    .select({
      accessId: programAccess.id,
      programName: programs.name,
      volumeName: programVolumes.name,
      fileId: programFiles.id,
      fileName: programFiles.displayName,
    })
    .from(programAccess)
    .innerJoin(programVolumes, eq(programVolumes.id, programAccess.programVolumeId))
    .innerJoin(programs, eq(programs.id, programVolumes.programId))
    .leftJoin(programFiles, and(eq(programFiles.programVolumeId, programVolumes.id), eq(programFiles.isActive, true)))
    .where(and(
      eq(programAccess.clientId, customer.clientId),
      eq(programAccess.status, 'active'),
      or(isNull(programAccess.expiresAt), sql`${programAccess.expiresAt} > ${now}`),
    ))
    .orderBy(asc(programs.name), asc(programVolumes.volumeNumber), asc(programFiles.sortOrder));

  const byAccess = new Map<number, { id: number; programName: string; volumeName: string; files: Array<{ id: number; name: string }> }>();
  for (const row of rows) {
    const item = byAccess.get(row.accessId) ?? {
      id: row.accessId,
      programName: row.programName,
      volumeName: row.volumeName,
      files: [],
    };
    if (row.fileId && row.fileName) item.files.push({ id: row.fileId, name: row.fileName });
    byAccess.set(row.accessId, item);
  }

  return { customer: { firstName: customer.firstName, email: customer.email }, programs: [...byAccess.values()] };
});
