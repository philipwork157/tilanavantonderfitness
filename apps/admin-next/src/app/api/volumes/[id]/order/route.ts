import { programOrderRequestSchema } from '@tilana/contracts/admin-programs';
import { programs } from '@tilana/db';
import { and, eq } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { findVolume } from '@/server/services/programs';

/**
 * Puts a volume's programs in a new order (the arrows on the volume page).
 * The list must hold every program of the volume exactly once; they are
 * numbered 10, 20, 30 ... so the website shows them in that order.
 */
export const POST = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  const id = await routeId(context);
  const parsed = programOrderRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'Send the programs in their new order.');
  const db = getDatabase();
  const volume = await findVolume(db, id);
  if (!volume) throw new HttpError(404, 'Volume not found.');

  const current = await db.select({ id: programs.id }).from(programs).where(eq(programs.volumeId, id));
  const wanted = parsed.data.programIds;
  const same = wanted.length === current.length && new Set(wanted).size === wanted.length && current.every((row) => wanted.includes(row.id));
  if (!same) throw new HttpError(409, 'The programs changed in the meantime. Refresh the page and try again.');

  await db.transaction(async (tx) => {
    for (const [index, programId] of wanted.entries()) {
      await tx.update(programs).set({ sortOrder: (index + 1) * 10 }).where(and(eq(programs.id, programId), eq(programs.volumeId, id)));
    }
  });
  return Response.json({ ok: true });
});
