import { z } from 'zod';
import { blogSlugSchema } from './blog';

/*
 * Kitchen recipes: edited in the admin, shown on the website's /kitchen pages.
 * Nutrition is per serving; ingredient amounts are for the stated servings
 * (the website can scale them).
 */

export const RECIPE_MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Training fuel'] as const;
export const recipeMealSchema = z.enum(RECIPE_MEALS);

/** Card colours, the same tones as the rest of the website. */
export const RECIPE_TONES = ['terracotta', 'sage', 'sand', 'white', 'caramel'] as const;
export const recipeToneSchema = z.enum(RECIPE_TONES);

/** Drawings shown when a recipe has no photo. */
export const RECIPE_ICONS = ['plate', 'bowl', 'toast', 'egg', 'pot', 'steak'] as const;
export const recipeIconSchema = z.enum(RECIPE_ICONS);

export const RECIPE_STATUSES = ['draft', 'published'] as const;
export const recipeStatusSchema = z.enum(RECIPE_STATUSES);

export const MAX_RECIPE_INGREDIENTS = 40;
export const MAX_RECIPE_STEPS = 30;
export const MAX_RECIPE_TAGS = 6;

const optionalText = (max: number) => z.string().trim().max(max).optional()
  .transform((value) => value || undefined);

export const recipeIngredientSchema = z.object({
  /** Empty for "a pinch of salt". */
  qty: z.number().positive().max(100_000).optional(),
  unit: optionalText(20),
  item: z.string().trim().min(1, 'Name every ingredient.').max(80),
  note: optionalText(80),
});

const grams = z.number().int().min(0).max(500);

/** Everything Tilana edits on a recipe (the photo is uploaded separately). */
export const recipeInputSchema = z.object({
  title: z.string().trim().min(3, 'Add a title.').max(120),
  /** Ignored by the admin: the server makes the web address from the title. */
  slug: blogSlugSchema.optional(),
  description: z.string().trim().max(240),
  meal: recipeMealSchema,
  prepMinutes: z.number().int().min(0).max(1440),
  cookMinutes: z.number().int().min(0).max(1440),
  servings: z.number().int().min(1).max(50),
  kcal: z.number().int().min(0).max(5000),
  proteinG: grams,
  carbsG: grams,
  fatG: grams,
  proteinNote: z.string().trim().max(400),
  ingredients: z.array(recipeIngredientSchema).max(MAX_RECIPE_INGREDIENTS),
  steps: z.array(z.string().trim().min(1, 'Remove empty steps.').max(600)).max(MAX_RECIPE_STEPS),
  tags: z.array(z.string().trim().min(1).max(30)).max(MAX_RECIPE_TAGS),
  notesMarkdown: z.string().max(20_000),
  tone: recipeToneSchema,
  icon: recipeIconSchema,
  imageAlt: z.string().trim().max(250).transform((value) => value || null).nullable(),
  /** The blog post this recipe comes from, if any. */
  blogPostId: z.number().int().positive().nullable(),
  /** Shows "a simple version of a meal from the blog" until Tilana adds her own recipe. */
  sample: z.boolean(),
  publishedAt: z.coerce.date().nullable(),
});

export const createRecipeRequestSchema = z.object({
  title: z.string().trim().min(3, 'Add a title.').max(120),
});

export const setRecipeStatusRequestSchema = z.object({
  status: recipeStatusSchema,
});

/** What the public website receives for each published recipe. */
export const publicRecipeSchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  meal: recipeMealSchema,
  prepMinutes: z.number(),
  cookMinutes: z.number(),
  servings: z.number(),
  nutrition: z.object({ kcal: z.number(), protein: z.number(), carbs: z.number(), fat: z.number() }),
  proteinNote: z.string(),
  ingredients: z.array(z.object({
    qty: z.number().optional(),
    unit: z.string().optional(),
    item: z.string(),
    note: z.string().optional(),
  })),
  steps: z.array(z.string()),
  tags: z.array(z.string()),
  notesMarkdown: z.string(),
  tone: recipeToneSchema,
  icon: recipeIconSchema,
  imageUrl: z.string().url().nullable(),
  imageAlt: z.string().nullable(),
  imageWidth: z.number().nullable(),
  imageHeight: z.number().nullable(),
  /** Only set when that blog post is published. */
  fromPost: z.object({ slug: z.string(), title: z.string() }).nullable(),
  sample: z.boolean(),
  publishedAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const publicRecipesResponseSchema = z.object({
  recipes: z.array(publicRecipeSchema),
});

export type RecipeMeal = z.infer<typeof recipeMealSchema>;
export type RecipeTone = z.infer<typeof recipeToneSchema>;
export type RecipeIcon = z.infer<typeof recipeIconSchema>;
export type RecipeIngredient = z.infer<typeof recipeIngredientSchema>;
export type RecipeInput = z.infer<typeof recipeInputSchema>;
export type PublicRecipe = z.infer<typeof publicRecipeSchema>;
