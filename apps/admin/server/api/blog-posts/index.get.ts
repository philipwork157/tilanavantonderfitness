import { desc } from 'drizzle-orm';
import { blogPosts } from '@tilana/db';

/** All posts for the admin list, most recently edited first. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const rows = await useDatabase().select({
    id: blogPosts.id,
    title: blogPosts.title,
    slug: blogPosts.slug,
    category: blogPosts.category,
    status: blogPosts.status,
    coverImagePath: blogPosts.coverImagePath,
    publishedAt: blogPosts.publishedAt,
    updatedAt: blogPosts.updatedAt,
  }).from(blogPosts).orderBy(desc(blogPosts.updatedAt));

  return {
    posts: rows.map(({ coverImagePath, ...row }) => ({ ...row, coverImageUrl: blogImagePublicUrl(coverImagePath) })),
  };
});
