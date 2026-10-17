import { volumes } from '@tilana/db';
import { requireAdmin, requireRole } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, sameOriginOnly } from '@/server/http';
import { listVolumes, nextVolumeNumber, toAdminVolume } from '@/server/services/programs';

/** Every volume, with how many programs it holds. */
export const GET = handle(async () => {
  await requireAdmin();
  const rows = await listVolumes(getDatabase());
  return Response.json({ volumes: rows.map(toAdminVolume) });
});

/** Add the next volume ("Volume 2"). It starts switched off so Tilana can prepare it. */
export const POST = handle(async (request: Request) => {
  sameOriginOnly(request, isSameOrigin);
  const admin = await requireRole(['admin']);
  const db = getDatabase();
  const number = await nextVolumeNumber(db);
  if (number > 99) throw new HttpError(400, 'There are already 99 volumes.');
  const [volume] = await db.insert(volumes).values({
    number,
    name: `Volume ${number}`,
    isActive: false,
    createdBy: admin.id,
    updatedBy: admin.id,
  }).onConflictDoNothing().returning();
  if (!volume) throw new HttpError(409, 'That volume was just added. Please refresh.');
  return Response.json({ volume: toAdminVolume(volume) });
});
