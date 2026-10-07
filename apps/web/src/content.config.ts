import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Blog posts are not a collection: they come live from the admin API
// (src/utils/blog-posts.ts).

// Kitchen recipes: one Markdown file per recipe in src/site/content/kitchen.
// Nutrition is per serving; ingredient quantities are for the stated number of servings (the page can scale them).
const siteKitchen = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/site/content/kitchen' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    meal: z.enum(['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Training fuel']),
    publishedAt: z.coerce.date(),
    prepMinutes: z.number().int().nonnegative(),
    cookMinutes: z.number().int().nonnegative().default(0),
    servings: z.number().int().positive(),
    nutrition: z.object({
      kcal: z.number().nonnegative(),
      protein: z.number().nonnegative(),
      carbs: z.number().nonnegative(),
      fat: z.number().nonnegative(),
    }),
    /** One or two sentences: why the protein in this meal matters (or how to add more). */
    proteinNote: z.string(),
    ingredients: z.array(
      z.object({
        qty: z.number().positive().optional(),
        unit: z.string().optional(),
        item: z.string(),
        note: z.string().optional(),
      }),
    ),
    steps: z.array(z.string()).min(1),
    tags: z.array(z.string()).default([]),
    tone: z.enum(['terracotta', 'sage', 'sand', 'white', 'caramel']).default('sand'),
    icon: z.enum(['toast', 'bowl', 'plate', 'egg', 'pot', 'steak']).default('plate'),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    /** Slug of a blog post this recipe comes from. */
    fromPost: z.string().optional(),
    /** Title of that post, shown on the recipe page (blog posts live in the admin). */
    fromPostTitle: z.string().optional(),
    /** Placeholder recipe written from her blog posts - shows a "sample" notice until Tilana replaces it. */
    sample: z.boolean().default(false),
    draft: z.boolean().default(false),
  }),
});

export const collections = { siteKitchen };
