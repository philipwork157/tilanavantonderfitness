import { eq } from 'drizzle-orm';
import { blogPosts } from '@tilana/db';
import { setBlogStatusRequestSchema } from '@tilana/contracts/blog';
import { findBlogPost, publishProblems } from '../../../services/blog-posts';

/** Publish (goes live on the next website build) or move back to draft. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  await requireAdmin(event);
  const id = routeId(event);
  const parsed = setBlogStatusRequestSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Choose draft or published.' });

  const db = useDatabase();
  const existing = await findBlogPost(db, id);
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Post not found.' });

  if (parsed.data.status === 'published') {
    const problems = publishProblems(existing);
    if (problems.length) throw createError({ statusCode: 400, statusMessage: problems.join(' ') });
  }

  const [post] = await db.update(blogPosts).set({
    status: parsed.data.status,
    publishedAt: parsed.data.status === 'published' ? existing.publishedAt ?? new Date() : existing.publishedAt,
  }).where(eq(blogPosts.id, id)).returning();

  return { post: toAdminBlogPost(post!) };
});
