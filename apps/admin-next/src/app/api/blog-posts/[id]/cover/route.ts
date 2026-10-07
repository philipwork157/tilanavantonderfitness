import { blogPosts } from '@tilana/db';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { findBlogPost } from '@/server/services/blog-posts';
import { deleteBlogImage, MAX_COVER_UPLOAD_BYTES, uploadBlogImage } from '@/server/utils/blog-images';
import { toAdminBlogPost } from '@/server/utils/blog-post-dto';
import { ImageRejectedError, processCoverImage } from '@/server/utils/image-processing';

/** Upload or replace the cover photo (multipart field "file"). */
export const POST = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  const id = await routeId(context);
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_COVER_UPLOAD_BYTES + 64 * 1024) throw new HttpError(413, 'Photos must be smaller than 10 MB.');

  const db = getDatabase();
  const existing = await findBlogPost(db, id);
  if (!existing) throw new HttpError(404, 'Post not found.');

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, 'Choose a photo to upload.');
  if (file.size > MAX_COVER_UPLOAD_BYTES) throw new HttpError(413, 'Photos must be smaller than 10 MB.');

  const image = await processCoverImage(Buffer.from(await file.arrayBuffer())).catch((error: unknown) => {
    if (error instanceof ImageRejectedError) throw new HttpError(400, error.message);
    throw error;
  });
  const path = await uploadBlogImage(id, image);
  const [post] = await db.update(blogPosts).set({
    coverImagePath: path,
    coverImageWidth: image.width,
    coverImageHeight: image.height,
  }).where(eq(blogPosts.id, id)).returning();
  await deleteBlogImage(existing.coverImagePath);
  return Response.json({ post: toAdminBlogPost(post!) });
});

export const DELETE = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  const id = await routeId(context);
  const db = getDatabase();
  const existing = await findBlogPost(db, id);
  if (!existing) throw new HttpError(404, 'Post not found.');
  const [post] = await db.update(blogPosts).set({
    coverImagePath: null,
    coverImageWidth: null,
    coverImageHeight: null,
  }).where(eq(blogPosts.id, id)).returning();
  await deleteBlogImage(existing.coverImagePath);
  return Response.json({ post: toAdminBlogPost(post!) });
});
