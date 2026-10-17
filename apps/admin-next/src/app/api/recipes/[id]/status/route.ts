import { setRecipeStatusRequestSchema } from '@tilana/contracts/kitchen';
import { recipes } from '@tilana/db';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { findRecipe, recipePublishProblems, toAdminRecipe } from '@/server/services/recipes';

/** Publish (on the website within minutes) or move back to draft. */
export const POST = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  const id = await routeId(context);
  const parsed = setRecipeStatusRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'Choose draft or published.');
  const db = getDatabase();
  const existing = await findRecipe(db, id);
  if (!existing) throw new HttpError(404, 'Recipe not found.');
  if (parsed.data.status === 'published') {
    const problems = recipePublishProblems(existing);
    if (problems.length) throw new HttpError(400, problems.join(' '));
  }
  const [recipe] = await db.update(recipes).set({
    status: parsed.data.status,
    publishedAt: parsed.data.status === 'published' ? existing.publishedAt ?? new Date() : existing.publishedAt,
  }).where(eq(recipes.id, id)).returning();
  return Response.json({ recipe: toAdminRecipe(recipe!) });
});
