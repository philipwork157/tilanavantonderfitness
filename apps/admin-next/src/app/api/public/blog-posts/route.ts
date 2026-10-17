import { getDatabase } from '@/server/db';
import { handle } from '@/server/http';
import { listPublishedPosts } from '@/server/services/blog-posts';
import { blogImagePublicUrl } from '@/server/utils/blog-images';

/**
 * Published posts for the public website. Only published content is exposed;
 * text is returned as stored and the website escapes it and renders the
 * Markdown safely. Cached for a minute (see next.config.ts headers).
 */
export const GET = handle(async () => {
  const posts = await listPublishedPosts(getDatabase());
  return Response.json({
    posts: posts.map((post) => ({
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      category: post.category,
      bodyMarkdown: post.bodyMarkdown,
      coverImageUrl: blogImagePublicUrl(post.coverImagePath),
      coverImageAlt: post.coverImageAlt,
      coverImageWidth: post.coverImageWidth,
      coverImageHeight: post.coverImageHeight,
      closingLine: post.closingLine,
      quoteText: post.quoteText,
      quoteCitation: post.quoteCitation,
      publishedAt: post.publishedAt!,
      updatedAt: post.updatedAt,
    })),
  });
});
