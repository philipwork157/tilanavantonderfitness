import { blogPostInputSchema } from '@tilana/contracts/blog';
import { blogPosts } from '@tilana/db';
import { and, eq, ne } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { findBlogPost, publishProblems } from '@/server/services/blog-posts';
import { deleteBlogImage } from '@/server/utils/blog-images';
import { toAdminBlogPost } from '@/server/utils/blog-post-dto';

export const GET = handle(async (_request: Request, context: IdContext) => {
  await requireAdmin();
  const post = await findBlogPost(getDatabase(), await routeId(context));
  if (!post) throw new HttpError(404, 'Post not found.');
  return Response.json({ post: toAdminBlogPost(post) });
});

/** Save every editable field. A published post must stay publishable. */
export const PUT = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  const id = await routeId(context);
  const parsed = blogPostInputSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HttpError(400, first ? `${first.path.join('.') || 'Post'}: ${first.message}` : 'Please check the post.');
  }
  const input = parsed.data;
  const db = getDatabase();
  const existing = await findBlogPost(db, id);
  if (!existing) throw new HttpError(404, 'Post not found.');

  const [clash] = await db.select({ id: blogPosts.id }).from(blogPosts)
    .where(and(eq(blogPosts.slug, input.slug), ne(blogPosts.id, id)));
  if (clash) throw new HttpError(409, 'Another post already uses this web address.');

  if (existing.status === 'published') {
    const problems = publishProblems({ ...existing, ...input });
    if (problems.length) throw new HttpError(400, problems.join(' '));
  }

  const [post] = await db.update(blogPosts).set({
    ...input,
    // A published post always keeps a date; drafts may leave it empty.
    publishedAt: input.publishedAt ?? (existing.status === 'published' ? existing.publishedAt : null),
  }).where(eq(blogPosts.id, id)).returning();
  return Response.json({ post: toAdminBlogPost(post!) });
});

/** Delete a post for good, including its cover photo. */
export const DELETE = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  const id = await routeId(context);
  const db = getDatabase();
  const existing = await findBlogPost(db, id);
  if (!existing) throw new HttpError(404, 'Post not found.');
  await db.delete(blogPosts).where(eq(blogPosts.id, id));
  await deleteBlogImage(existing.coverImagePath);
  return Response.json({ ok: true });
});
