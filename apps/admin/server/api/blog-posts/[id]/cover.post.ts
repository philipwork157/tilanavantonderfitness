import { eq } from 'drizzle-orm';
import { blogPosts } from '@tilana/db';
import { findBlogPost } from '../../../services/blog-posts';
import { ImageRejectedError, processCoverImage } from '../../../utils/image-processing';

/** Upload or replace the cover photo (multipart field "file"). */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  await requireAdmin(event);
  const id = routeId(event);

  const declared = Number(getHeader(event, 'content-length') ?? 0);
  if (declared > MAX_COVER_UPLOAD_BYTES + 64 * 1024) {
    throw createError({ statusCode: 413, statusMessage: 'Photos must be smaller than 10 MB.' });
  }

  const db = useDatabase();
  const existing = await findBlogPost(db, id);
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Post not found.' });

  const parts = await readMultipartFormData(event);
  const file = parts?.find(part => part.name === 'file' && part.data?.length);
  if (!file) throw createError({ statusCode: 400, statusMessage: 'Choose a photo to upload.' });
  if (file.data.length > MAX_COVER_UPLOAD_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Photos must be smaller than 10 MB.' });
  }

  const image = await processCoverImage(file.data).catch((error) => {
    if (error instanceof ImageRejectedError) throw createError({ statusCode: 400, statusMessage: error.message });
    throw error;
  });
  const path = await uploadBlogImage(id, image);

  const [post] = await db.update(blogPosts).set({
    coverImagePath: path,
    coverImageWidth: image.width,
    coverImageHeight: image.height,
  }).where(eq(blogPosts.id, id)).returning();

  await deleteBlogImage(existing.coverImagePath);
  return { post: toAdminBlogPost(post!) };
});
