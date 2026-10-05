import { and, eq, ne } from 'drizzle-orm';
import { blogPosts } from '@tilana/db';
import { blogPostInputSchema } from '@tilana/contracts/blog';
import { findBlogPost, publishProblems } from '../../services/blog-posts';

/** Save every editable field. A published post must stay publishable. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  await requireAdmin(event);
  const id = routeId(event);

  const parsed = blogPostInputSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw createError({ statusCode: 400, statusMessage: first ? `${first.path.join('.') || 'Post'}: ${first.message}` : 'Please check the post.' });
  }
  const input = parsed.data;
  const db = useDatabase();

  const existing = await findBlogPost(db, id);
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Post not found.' });

  const [clash] = await db.select({ id: blogPosts.id }).from(blogPosts)
    .where(and(eq(blogPosts.slug, input.slug), ne(blogPosts.id, id)));
  if (clash) throw createError({ statusCode: 409, statusMessage: 'Another post already uses this web address.' });

  if (existing.status === 'published') {
    const problems = publishProblems({ ...existing, ...input });
    if (problems.length) throw createError({ statusCode: 400, statusMessage: problems.join(' ') });
  }

  const [post] = await db.update(blogPosts).set({
    ...input,
    // A published post always keeps a date; drafts may leave it empty.
    publishedAt: input.publishedAt ?? (existing.status === 'published' ? existing.publishedAt : null),
  }).where(eq(blogPosts.id, id)).returning();

  return { post: toAdminBlogPost(post!) };
});
