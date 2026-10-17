import { z } from 'zod';

export const BLOG_CATEGORIES = ['Movement', 'Strength', 'Nourishment', 'Nurturance', 'Motherhood'] as const;
export const blogCategorySchema = z.enum(BLOG_CATEGORIES);

export const BLOG_STATUSES = ['draft', 'published'] as const;
export const blogStatusSchema = z.enum(BLOG_STATUSES);

export const blogSlugSchema = z.string().trim().toLowerCase().min(3).max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only.');

/** Turn a title into a URL slug: "When Life Gets in the Way!" → "when-life-gets-in-the-way". */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '');
}

const optionalText = (max: number) => z.string().trim().max(max).transform(value => value || null).nullable();

/** Everything Tilana edits on a post. Text is stored as typed; the website escapes it. */
export const blogPostInputSchema = z.object({
  title: z.string().trim().min(3, 'Add a title.').max(160),
  /** Ignored by the admin: the server makes the web address from the title. */
  slug: blogSlugSchema.optional(),
  // Drafts may be saved half-written; publishing checks for a summary (publishProblems).
  excerpt: z.string().trim().max(300),
  category: blogCategorySchema,
  bodyMarkdown: z.string().max(100_000),
  coverImageAlt: optionalText(250),
  closingLine: optionalText(300),
  quoteText: optionalText(500),
  quoteCitation: optionalText(120),
  publishedAt: z.coerce.date().nullable(),
});

export const createBlogPostRequestSchema = z.object({
  title: z.string().trim().min(3, 'Add a title.').max(160),
});

export const setBlogStatusRequestSchema = z.object({
  status: blogStatusSchema,
});

/** What the public website receives for each published post. */
export const publicBlogPostSchema = z.object({
  slug: z.string(),
  title: z.string(),
  excerpt: z.string(),
  category: blogCategorySchema,
  bodyMarkdown: z.string(),
  coverImageUrl: z.string().url().nullable(),
  coverImageAlt: z.string().nullable(),
  coverImageWidth: z.number().int().positive().nullable(),
  coverImageHeight: z.number().int().positive().nullable(),
  closingLine: z.string().nullable(),
  quoteText: z.string().nullable(),
  quoteCitation: z.string().nullable(),
  publishedAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const publicBlogPostsResponseSchema = z.object({
  posts: z.array(publicBlogPostSchema),
});

export type BlogCategory = z.infer<typeof blogCategorySchema>;
export type BlogStatus = z.infer<typeof blogStatusSchema>;
export type BlogPostInput = z.infer<typeof blogPostInputSchema>;
export type PublicBlogPost = z.infer<typeof publicBlogPostSchema>;
