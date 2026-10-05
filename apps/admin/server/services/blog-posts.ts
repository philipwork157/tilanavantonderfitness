import { and, desc, eq, like, ne, or } from 'drizzle-orm';
import { blogPosts, type BlogPost, type Database } from '@tilana/db';
import { slugify } from '@tilana/contracts/blog';

/** A unique slug based on the title: "my-post", then "my-post-2", ... */
export async function uniqueSlug(db: Database, base: string, exceptId?: number): Promise<string> {
  const root = slugify(base) || 'post';
  const rows = await db.select({ slug: blogPosts.slug }).from(blogPosts).where(and(
    or(eq(blogPosts.slug, root), like(blogPosts.slug, `${root}-%`)),
    exceptId ? ne(blogPosts.id, exceptId) : undefined,
  ));
  const taken = new Set(rows.map(row => row.slug));
  if (!taken.has(root)) return root;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${root}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export async function findBlogPost(db: Database, id: number): Promise<BlogPost | undefined> {
  const [post] = await db.select().from(blogPosts).where(eq(blogPosts.id, id));
  return post;
}

/** Reasons a post cannot be published yet; empty when it is ready. */
export function publishProblems(post: Pick<BlogPost, 'title' | 'excerpt' | 'bodyMarkdown' | 'coverImagePath' | 'coverImageAlt'>): string[] {
  const problems: string[] = [];
  if (post.title.trim().length < 3) problems.push('Add a title.');
  if (post.excerpt.trim().length < 10) problems.push('Add a short summary.');
  if (post.bodyMarkdown.trim().length < 50) problems.push('Write the post.');
  if (post.coverImagePath && !post.coverImageAlt?.trim()) problems.push('Describe the cover photo for screen readers.');
  return problems;
}

export function listPublishedPosts(db: Database) {
  return db.select().from(blogPosts)
    .where(eq(blogPosts.status, 'published'))
    .orderBy(desc(blogPosts.publishedAt));
}
