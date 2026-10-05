import type { BlogPost } from '@tilana/db';

/** Admin view of a post: database row plus the public cover URL. */
export function toAdminBlogPost(post: BlogPost) {
  return {
    id: post.id,
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
    status: post.status,
    publishedAt: post.publishedAt,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}
