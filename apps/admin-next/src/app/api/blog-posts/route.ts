import { createBlogPostRequestSchema } from '@tilana/contracts/blog';
import { blogPosts } from '@tilana/db';
import { desc } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, sameOriginOnly } from '@/server/http';
import { uniqueSlug } from '@/server/services/blog-posts';
import { blogImagePublicUrl } from '@/server/utils/blog-images';

/** All posts for the admin list, most recently edited first. */
export const GET = handle(async () => {
  await requireAdmin();
  const rows = await getDatabase().select({
    id: blogPosts.id,
    title: blogPosts.title,
    slug: blogPosts.slug,
    category: blogPosts.category,
    status: blogPosts.status,
    coverImagePath: blogPosts.coverImagePath,
    publishedAt: blogPosts.publishedAt,
    updatedAt: blogPosts.updatedAt,
  }).from(blogPosts).orderBy(desc(blogPosts.updatedAt));
  return Response.json({
    posts: rows.map(({ coverImagePath, ...row }) => ({ ...row, coverImageUrl: blogImagePublicUrl(coverImagePath) })),
  });
});

/** Start a new draft from just a title. */
export const POST = handle(async (request: Request) => {
  sameOriginOnly(request, isSameOrigin);
  const admin = await requireAdmin();
  const parsed = createBlogPostRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'Add a title of at least 3 characters.');
  const db = getDatabase();
  const [post] = await db.insert(blogPosts).values({
    title: parsed.data.title,
    slug: await uniqueSlug(db, parsed.data.title),
    createdBy: admin.id,
  }).returning({ id: blogPosts.id });
  return Response.json({ id: post!.id });
});
