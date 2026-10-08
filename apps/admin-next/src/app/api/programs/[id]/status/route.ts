import { setProgramStatusRequestSchema } from '@tilana/contracts/admin-programs';
import { programs } from '@tilana/db';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { findProgram, publishProblems, toAdminProgram } from '@/server/services/programs';

/** Publish (on the website), move back to draft, or archive (hidden, kept for past orders). */
export const POST = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  const admin = await requireAdmin();
  const id = await routeId(context);
  const parsed = setProgramStatusRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'Choose draft, published or archived.');
  const db = getDatabase();
  const existing = await findProgram(db, id);
  if (!existing) throw new HttpError(404, 'Program not found.');
  const { status } = parsed.data;
  if (status === 'published') {
    const problems = publishProblems(existing, existing.volumes);
    if (problems.length) throw new HttpError(400, problems.join(' '));
  }
  await db.update(programs).set({
    status,
    publishedAt: status === 'published' ? existing.publishedAt ?? new Date() : existing.publishedAt,
    updatedBy: admin.id,
  }).where(eq(programs.id, id));
  return Response.json({ program: toAdminProgram((await findProgram(db, id))!) });
});
