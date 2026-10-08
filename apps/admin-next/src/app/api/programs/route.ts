import { createProgramRequestSchema } from '@tilana/contracts/admin-programs';
import { programs, programVolumes } from '@tilana/db';
import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, sameOriginOnly } from '@/server/http';
import { listPrograms, toAdminProgram, uniqueProgramSlug, volumeName, volumeSlug } from '@/server/services/programs';

/** All programs with their volumes, in website order. */
export const GET = handle(async () => {
  await requireAdmin();
  const rows = await listPrograms(getDatabase());
  return Response.json({ programs: rows.map(toAdminProgram) });
});

/** Start a new draft program (with Volume 1) from just a name. */
export const POST = handle(async (request: Request) => {
  sameOriginOnly(request, isSameOrigin);
  const admin = await requireAdmin();
  const parsed = createProgramRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'Add a name of at least 2 characters.');
  const db = getDatabase();
  const slug = await uniqueProgramSlug(db, parsed.data.name);
  const id = await db.transaction(async (tx) => {
    const [program] = await tx.insert(programs).values({
      name: parsed.data.name,
      slug,
      createdBy: admin.id,
      updatedBy: admin.id,
      // New programs go to the end of the list.
      sortOrder: 1000,
    }).returning({ id: programs.id });
    await tx.insert(programVolumes).values({
      programId: program!.id,
      slug: volumeSlug(slug, 1),
      volumeNumber: 1,
      name: volumeName(parsed.data.name, 1),
      priceCents: 39_900,
    });
    return program!.id;
  });
  return Response.json({ id });
});
