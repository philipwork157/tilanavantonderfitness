import { programInputSchema } from '@tilana/contracts/admin-programs';
import { programs, programVolumes } from '@tilana/db';
import { and, eq, ne } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { findProgram, publishProblems, toAdminProgram, volumeSlug } from '@/server/services/programs';

export const GET = handle(async (_request: Request, context: IdContext) => {
  await requireAdmin();
  const program = await findProgram(getDatabase(), await routeId(context));
  if (!program) throw new HttpError(404, 'Program not found.');
  return Response.json({ program: toAdminProgram(program) });
});

/** Save the program's website content. A published program must stay publishable. */
export const PUT = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  const admin = await requireAdmin();
  const id = await routeId(context);
  const parsed = programInputSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HttpError(400, first ? first.message : 'Please check the program.');
  }
  const input = parsed.data;
  const db = getDatabase();
  const existing = await findProgram(db, id);
  if (!existing) throw new HttpError(404, 'Program not found.');

  const slugChanged = input.slug !== existing.slug;
  if (slugChanged) {
    // Volume slugs are in people's baskets and links once a program has been live.
    if (existing.publishedAt) throw new HttpError(409, 'The web address cannot change after the program has been published.');
    const [clash] = await db.select({ id: programs.id }).from(programs).where(and(eq(programs.slug, input.slug), ne(programs.id, id)));
    if (clash) throw new HttpError(409, 'Another program already uses this web address.');
  }
  if (existing.status === 'published') {
    const problems = publishProblems(input, existing.volumes);
    if (problems.length) throw new HttpError(400, problems.join(' '));
  }

  await db.transaction(async (tx) => {
    await tx.update(programs).set({ ...input, updatedBy: admin.id }).where(eq(programs.id, id));
    if (slugChanged) {
      for (const volume of existing.volumes) {
        await tx.update(programVolumes).set({ slug: volumeSlug(input.slug, volume.volumeNumber) }).where(eq(programVolumes.id, volume.id));
      }
    }
  });
  return Response.json({ program: toAdminProgram((await findProgram(db, id))!) });
});

/** Delete a program that is not on the website. Its PDFs stay in storage. */
export const DELETE = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  const id = await routeId(context);
  const db = getDatabase();
  const existing = await findProgram(db, id);
  if (!existing) throw new HttpError(404, 'Program not found.');
  if (existing.status === 'published') throw new HttpError(409, 'Unpublish or archive the program before deleting it.');
  await db.delete(programs).where(eq(programs.id, id));
  return Response.json({ ok: true });
});
