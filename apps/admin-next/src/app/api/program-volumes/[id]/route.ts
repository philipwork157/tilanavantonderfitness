import { volumeInputSchema } from '@tilana/contracts/admin-programs';
import { programVolumes } from '@tilana/db';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { findProgram, findVolume, toAdminProgram } from '@/server/services/programs';

/** The program the volume belongs to; a published program must keep something for sale. */
async function guardPublished(volumeId: number, programId: number, stillAvailable: boolean) {
  const program = (await findProgram(getDatabase(), programId))!;
  const othersForSale = program.volumes.some(volume => volume.id !== volumeId && volume.isAvailable);
  if (program.status === 'published' && !stillAvailable && !othersForSale) {
    throw new HttpError(409, 'A published program needs at least one volume for sale. Unpublish the program first.');
  }
}

/** Save name, price and whether it is for sale. Prices are money: admins only. */
export const PUT = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireRole(['admin']);
  const id = await routeId(context);
  const parsed = volumeInputSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Please check the volume.');
  const db = getDatabase();
  const volume = await findVolume(db, id);
  if (!volume) throw new HttpError(404, 'Volume not found.');
  if (parsed.data.isAvailable && !volume.filePath) throw new HttpError(400, 'Upload the PDF before putting this volume up for sale.');
  await guardPublished(id, volume.programId, parsed.data.isAvailable);
  await db.update(programVolumes).set(parsed.data).where(eq(programVolumes.id, id));
  return Response.json({ program: toAdminProgram((await findProgram(db, volume.programId))!) });
});

/** Remove a volume. Its PDF stays in storage. */
export const DELETE = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireRole(['admin']);
  const id = await routeId(context);
  const db = getDatabase();
  const volume = await findVolume(db, id);
  if (!volume) throw new HttpError(404, 'Volume not found.');
  await guardPublished(id, volume.programId, false);
  await db.delete(programVolumes).where(eq(programVolumes.id, id));
  return Response.json({ program: toAdminProgram((await findProgram(db, volume.programId))!) });
});
