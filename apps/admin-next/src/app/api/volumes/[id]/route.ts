import { updateVolumeRequestSchema } from '@tilana/contracts/admin-programs';
import { programs, volumes } from '@tilana/db';
import { count, eq } from 'drizzle-orm';
import { requireAdmin, requireRole } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { findVolume, listVolumePrograms, toAdminProgram, toAdminVolume } from '@/server/services/programs';

/** One volume and its programs. */
export const GET = handle(async (_request: Request, context: IdContext) => {
  await requireAdmin();
  const db = getDatabase();
  const volume = await findVolume(db, await routeId(context));
  if (!volume) throw new HttpError(404, 'Volume not found.');
  const rows = await listVolumePrograms(db, volume);
  return Response.json({
    volume: toAdminVolume({ ...volume, programCount: rows.length, readyCount: rows.filter(row => row.filePath).length }),
    programs: rows.map(toAdminProgram),
  });
});

/** Rename the volume, or switch all its programs on or off for the website. */
export const PUT = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  const admin = await requireRole(['admin']);
  const id = await routeId(context);
  const parsed = updateVolumeRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Please check the volume.');
  const db = getDatabase();
  const [volume] = await db.update(volumes).set({ ...parsed.data, updatedBy: admin.id }).where(eq(volumes.id, id)).returning();
  if (!volume) throw new HttpError(404, 'Volume not found.');
  return Response.json({ volume: toAdminVolume(volume) });
});

/** Delete an empty volume. Volumes with programs cannot be deleted. */
export const DELETE = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireRole(['admin']);
  const id = await routeId(context);
  const db = getDatabase();
  const [row] = await db.select({ total: count() }).from(programs).where(eq(programs.volumeId, id));
  if ((row?.total ?? 0) > 0) throw new HttpError(409, 'Delete its programs first. A volume with programs cannot be deleted.');
  const deleted = await db.delete(volumes).where(eq(volumes.id, id)).returning({ id: volumes.id });
  if (!deleted.length) throw new HttpError(404, 'Volume not found.');
  return Response.json({ ok: true });
});
