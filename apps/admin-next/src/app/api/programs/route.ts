import { createProgramRequestSchema } from '@tilana/contracts/admin-programs';
import { programs } from '@tilana/db';
import { requireRole } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, sameOriginOnly } from '@/server/http';
import { findVolume, uniqueProgramSlug } from '@/server/services/programs';

/** Add a program to a volume from a name and a price. Prices are money: admins only. */
export const POST = handle(async (request: Request) => {
  sameOriginOnly(request, isSameOrigin);
  const admin = await requireRole(['admin']);
  const parsed = createProgramRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Add a name and a price.');
  const db = getDatabase();
  const volume = await findVolume(db, parsed.data.volumeId);
  if (!volume) throw new HttpError(404, 'Volume not found.');
  const [program] = await db.insert(programs).values({
    volumeId: volume.id,
    name: parsed.data.name,
    slug: await uniqueProgramSlug(db, parsed.data.name, volume.number),
    priceCents: parsed.data.priceCents,
    createdBy: admin.id,
    updatedBy: admin.id,
    // New programs go to the end of the list.
    sortOrder: 1000,
  }).returning({ id: programs.id });
  return Response.json({ id: program!.id });
});
