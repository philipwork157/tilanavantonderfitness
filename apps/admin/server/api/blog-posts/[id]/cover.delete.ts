import { eq } from 'drizzle-orm';
import { blogPosts } from '@tilana/db';
import { findBlogPost } from '../../../services/blog-posts';

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  await requireAdmin(event);
  const id = routeId(event);
  const db = useDatabase();
  const existing = await findBlogPost(db, id);
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Post not found.' });

  const [post] = await db.update(blogPosts).set({
    coverImagePath: null,
    coverImageWidth: null,
    coverImageHeight: null,
  }).where(eq(blogPosts.id, id)).returning();

  await deleteBlogImage(existing.coverImagePath);
  return { post: toAdminBlogPost(post!) };
});
