import { listPublishedPosts } from '../../services/blog-posts';

/**
 * Published posts for the public website (read at build time). Only
 * published content is exposed; text is returned as stored and the website
 * escapes it and renders the Markdown safely.
 */
export default defineEventHandler(async (event) => {
  const posts = await listPublishedPosts(useDatabase());
  setHeader(event, 'cache-control', 'public, max-age=60');
  return {
    posts: posts.map(post => ({
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
  };
});
