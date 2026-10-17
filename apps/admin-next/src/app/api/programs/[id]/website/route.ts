import { programWebsiteRequestSchema } from '@tilana/contracts/admin-programs';
import { programs } from '@tilana/db';
import { eq } from 'drizzle-orm';
import { requireRole } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { findProgram, toAdminProgram } from '@/server/services/programs';

/**
 * Switches one program on or off for the website. Off hides it and stops new
 * purchases; nothing is deleted and past buyers can still get their PDFs.
 */
export const PUT = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  const admin = await requireRole(['admin']);
  const id = await routeId(context);
  const parsed = programWebsiteRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'Please choose on or off.');
  const db = getDatabase();
  const updated = await db.update(programs).set({ isActive: parsed.data.isActive, updatedBy: admin.id }).where(eq(programs.id, id)).returning({ id: programs.id });
  if (!updated.length) throw new HttpError(404, 'Program not found.');
  return Response.json({ program: toAdminProgram((await findProgram(db, id))!) });
});
