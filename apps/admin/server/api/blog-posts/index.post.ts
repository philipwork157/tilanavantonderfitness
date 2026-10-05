import { blogPosts } from '@tilana/db';
import { createBlogPostRequestSchema } from '@tilana/contracts/blog';
import { uniqueSlug } from '../../services/blog-posts';

/** Start a new draft from just a title. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const admin = await requireAdmin(event);
  const parsed = createBlogPostRequestSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Add a title of at least 3 characters.' });
  }

  const db = useDatabase();
  const [post] = await db.insert(blogPosts).values({
    title: parsed.data.title,
    slug: await uniqueSlug(db, parsed.data.title),
    createdBy: admin.id,
  }).returning({ id: blogPosts.id });
  return { id: post!.id };
});
