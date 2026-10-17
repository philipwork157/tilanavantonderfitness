import { recipeInputSchema } from '@tilana/contracts/kitchen';
import { blogPosts, recipes } from '@tilana/db';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { findRecipe, recipePublishProblems, toAdminRecipe, uniqueRecipeSlug } from '@/server/services/recipes';
import { deleteBlogImage } from '@/server/utils/blog-images';

export const GET = handle(async (_request: Request, context: IdContext) => {
  await requireAdmin();
  const recipe = await findRecipe(getDatabase(), await routeId(context));
  if (!recipe) throw new HttpError(404, 'Recipe not found.');
  return Response.json({ recipe: toAdminRecipe(recipe) });
});

/** Save every editable field. A published recipe must stay complete. */
export const PUT = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  const id = await routeId(context);
  const parsed = recipeInputSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HttpError(400, first?.message ?? 'Please check the recipe.');
  }
  const input = parsed.data;
  const db = getDatabase();
  const existing = await findRecipe(db, id);
  if (!existing) throw new HttpError(404, 'Recipe not found.');

  // The web address follows a new title only while the recipe has never been on
  // the website; after that it stays fixed so shared links keep working.
  const renamed = input.title.trim() !== existing.title.trim();
  const slug = renamed && existing.status === 'draft' && !existing.publishedAt
    ? await uniqueRecipeSlug(db, input.title, id)
    : existing.slug;
  if (input.blogPostId) {
    const [post] = await db.select({ id: blogPosts.id }).from(blogPosts).where(eq(blogPosts.id, input.blogPostId));
    if (!post) throw new HttpError(400, 'That blog post no longer exists.');
  }
  if (existing.status === 'published') {
    const problems = recipePublishProblems({ ...existing, ...input });
    if (problems.length) throw new HttpError(400, problems.join(' '));
  }

  const [recipe] = await db.update(recipes).set({
    ...input,
    slug,
    // A published recipe always keeps a date; drafts may leave it empty.
    publishedAt: input.publishedAt ?? (existing.status === 'published' ? existing.publishedAt : null),
  }).where(eq(recipes.id, id)).returning();
  return Response.json({ recipe: toAdminRecipe(recipe!) });
});

/** Delete a recipe for good, including its photo. */
export const DELETE = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  const id = await routeId(context);
  const db = getDatabase();
  const existing = await findRecipe(db, id);
  if (!existing) throw new HttpError(404, 'Recipe not found.');
  await db.delete(recipes).where(eq(recipes.id, id));
  await deleteBlogImage(existing.imagePath);
  return Response.json({ ok: true });
});
