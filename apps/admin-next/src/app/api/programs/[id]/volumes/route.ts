import { programVolumes } from '@tilana/db';
import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { findProgram, nextVolumeNumber, toAdminProgram, volumeName, volumeSlug } from '@/server/services/programs';

/** Add the next volume (not for sale until it has a PDF). */
export const POST = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  const id = await routeId(context);
  const db = getDatabase();
  const program = await findProgram(db, id);
  if (!program) throw new HttpError(404, 'Program not found.');
  const number = nextVolumeNumber(program.volumes);
  if (number > 99) throw new HttpError(409, 'This program already has the maximum number of volumes.');
  const last = program.volumes.at(-1);
  await db.insert(programVolumes).values({
    programId: id,
    slug: volumeSlug(program.slug, number),
    volumeNumber: number,
    name: volumeName(program.name, number),
    priceCents: last?.priceCents ?? 39_900,
  });
  return Response.json({ program: toAdminProgram((await findProgram(db, id))!) });
});
