import { setBlogStatusRequestSchema } from '@tilana/contracts/blog';
import { blogPosts } from '@tilana/db';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { findBlogPost, publishProblems } from '@/server/services/blog-posts';
import { toAdminBlogPost } from '@/server/utils/blog-post-dto';

/** Publish (live on the website within minutes) or move back to draft. */
export const POST = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  const id = await routeId(context);
  const parsed = setBlogStatusRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'Choose draft or published.');
  const db = getDatabase();
  const existing = await findBlogPost(db, id);
  if (!existing) throw new HttpError(404, 'Post not found.');
  if (parsed.data.status === 'published') {
    const problems = publishProblems(existing);
    if (problems.length) throw new HttpError(400, problems.join(' '));
  }
  const [post] = await db.update(blogPosts).set({
    status: parsed.data.status,
    publishedAt: parsed.data.status === 'published' ? existing.publishedAt ?? new Date() : existing.publishedAt,
  }).where(eq(blogPosts.id, id)).returning();
  return Response.json({ post: toAdminBlogPost(post!) });
});
