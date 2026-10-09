import { programInputSchema } from '@tilana/contracts/admin-programs';
import { hasAnyRole, programs } from '@tilana/db';
import { and, eq, ne } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { removePreviewImages } from '@/server/services/program-previews';
import { findProgram, isOnWebsite, isProgramSold, toAdminProgram } from '@/server/services/programs';

export const GET = handle(async (_request: Request, context: IdContext) => {
  await requireAdmin();
  const program = await findProgram(getDatabase(), await routeId(context));
  if (!program) throw new HttpError(404, 'Program not found.');
  return Response.json({ program: toAdminProgram(program) });
});

/** Save the program's website content and price. Price changes need the admin role. */
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

  if (input.priceCents !== existing.priceCents && !hasAnyRole(admin.roles, ['admin'])) {
    throw new HttpError(403, 'Only admins can change prices.');
  }
  if (input.slug !== existing.slug) {
    // The slug is in people's baskets and links while the program is on the website.
    if (isOnWebsite(existing, existing.volume)) {
      throw new HttpError(409, 'The web address cannot change while the program is on the website.');
    }
    const [clash] = await db.select({ id: programs.id }).from(programs).where(and(eq(programs.slug, input.slug), ne(programs.id, id)));
    if (clash) throw new HttpError(409, 'Another program already uses this web address.');
  }

  await db.update(programs).set({ ...input, updatedBy: admin.id }).where(eq(programs.id, id));
  return Response.json({ program: toAdminProgram((await findProgram(db, id))!) });
});

/**
 * Delete a program that was never sold. Its PDFs stay in storage; its
 * sneak peek pictures are removed. Sold
 * programs stay: "Email PDFs again" needs them for past buyers.
 */
export const DELETE = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  const id = await routeId(context);
  if (await isProgramSold(getDatabase(), id)) {
    throw new HttpError(409, 'People have bought this program, so it stays: past buyers may need their PDFs again. Switch it off instead to take it off the website.');
  }
  const deleted = await getDatabase().delete(programs).where(eq(programs.id, id)).returning({ id: programs.id, preview: programs.preview });
  if (!deleted.length) throw new HttpError(404, 'Program not found.');
  await removePreviewImages(deleted[0]!.preview);
  return Response.json({ ok: true });
});
