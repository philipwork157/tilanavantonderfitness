import { eq } from 'drizzle-orm';
import { blogPosts } from '@tilana/db';
import { findBlogPost } from '../../services/blog-posts';

/** Delete a post for good, including its cover photo. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  await requireAdmin(event);
  const id = routeId(event);
  const db = useDatabase();
  const existing = await findBlogPost(db, id);
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Post not found.' });

  await db.delete(blogPosts).where(eq(blogPosts.id, id));
  await deleteBlogImage(existing.coverImagePath);
  return { ok: true as const };
});
