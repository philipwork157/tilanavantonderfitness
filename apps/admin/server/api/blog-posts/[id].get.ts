import { findBlogPost } from '../../services/blog-posts';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const post = await findBlogPost(useDatabase(), routeId(event));
  if (!post) throw createError({ statusCode: 404, statusMessage: 'Post not found.' });
  return { post: toAdminBlogPost(post) };
});
