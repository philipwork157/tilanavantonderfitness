import { recipes } from '@tilana/db';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { findRecipe, toAdminRecipe } from '@/server/services/recipes';
import { deleteBlogImage, MAX_COVER_UPLOAD_BYTES, uploadRecipeImage } from '@/server/utils/blog-images';
import { ImageRejectedError, processCoverImage } from '@/server/utils/image-processing';

/** Upload or replace the recipe photo (multipart field "file"). */
export const POST = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  const id = await routeId(context);
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_COVER_UPLOAD_BYTES + 64 * 1024) throw new HttpError(413, 'Photos must be smaller than 10 MB.');

  const db = getDatabase();
  const existing = await findRecipe(db, id);
  if (!existing) throw new HttpError(404, 'Recipe not found.');

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, 'Choose a photo to upload.');
  if (file.size > MAX_COVER_UPLOAD_BYTES) throw new HttpError(413, 'Photos must be smaller than 10 MB.');

  const image = await processCoverImage(Buffer.from(await file.arrayBuffer())).catch((error: unknown) => {
    if (error instanceof ImageRejectedError) throw new HttpError(400, error.message);
    throw error;
  });
  const path = await uploadRecipeImage(id, image);
  const [recipe] = await db.update(recipes).set({ imagePath: path, imageWidth: image.width, imageHeight: image.height })
    .where(eq(recipes.id, id)).returning();
  await deleteBlogImage(existing.imagePath);
  return Response.json({ recipe: toAdminRecipe(recipe!) });
});

/** Remove the photo: the website shows the drawing again. */
export const DELETE = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  const id = await routeId(context);
  const db = getDatabase();
  const existing = await findRecipe(db, id);
  if (!existing) throw new HttpError(404, 'Recipe not found.');
  const [recipe] = await db.update(recipes).set({ imagePath: null, imageWidth: null, imageHeight: null })
    .where(eq(recipes.id, id)).returning();
  await deleteBlogImage(existing.imagePath);
  return Response.json({ recipe: toAdminRecipe(recipe!) });
});
