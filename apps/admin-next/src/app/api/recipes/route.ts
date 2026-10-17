import { createRecipeRequestSchema } from '@tilana/contracts/kitchen';
import { recipes } from '@tilana/db';
import { desc } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, sameOriginOnly } from '@/server/http';
import { uniqueRecipeSlug } from '@/server/services/recipes';
import { blogImagePublicUrl } from '@/server/utils/blog-images';

/** All recipes for the admin list, most recently edited first. */
export const GET = handle(async () => {
  await requireAdmin();
  const rows = await getDatabase().select({
    id: recipes.id,
    title: recipes.title,
    slug: recipes.slug,
    meal: recipes.meal,
    proteinG: recipes.proteinG,
    kcal: recipes.kcal,
    prepMinutes: recipes.prepMinutes,
    cookMinutes: recipes.cookMinutes,
    tone: recipes.tone,
    icon: recipes.icon,
    sample: recipes.sample,
    status: recipes.status,
    imagePath: recipes.imagePath,
    publishedAt: recipes.publishedAt,
    updatedAt: recipes.updatedAt,
  }).from(recipes).orderBy(desc(recipes.updatedAt));
  return Response.json({
    recipes: rows.map(({ imagePath, ...row }) => ({ ...row, imageUrl: blogImagePublicUrl(imagePath) })),
  });
});

/** Start a new draft recipe from just a title. */
export const POST = handle(async (request: Request) => {
  sameOriginOnly(request, isSameOrigin);
  const admin = await requireAdmin();
  const parsed = createRecipeRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'Add a title of at least 3 characters.');
  const db = getDatabase();
  const [recipe] = await db.insert(recipes).values({
    title: parsed.data.title,
    slug: await uniqueRecipeSlug(db, parsed.data.title),
    createdBy: admin.id,
  }).returning({ id: recipes.id });
  return Response.json({ id: recipe!.id });
});
