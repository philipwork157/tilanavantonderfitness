/** Database tests for kitchen recipes. Need TEST_DATABASE_URL (throwaway Postgres). */
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { recipeInputSchema } from '@tilana/contracts/kitchen';
import { blogPosts, createDatabase, recipes, type Database } from '@tilana/db';
import { listPublishedRecipes, recipePublishProblems, uniqueRecipeSlug } from '@/server/services/recipes';

const url = process.env.TEST_DATABASE_URL;

const complete = {
  title: 'Chicken bowl',
  description: 'Garlicky chicken, rice and veg.',
  servings: 2,
  kcal: 550,
  proteinG: 42,
  carbsG: 69,
  fatG: 9,
  proteinNote: 'About 30 g of protein from the chicken.',
  ingredients: [{ qty: 300, unit: 'g', item: 'chicken breast' }],
  steps: ['Cook the rice.'],
  imagePath: null,
  imageAlt: null,
};

describe('recipe input', () => {
  it('accepts a full recipe and trims empty extras', () => {
    const parsed = recipeInputSchema.parse({
      ...complete, slug: 'chicken-bowl', meal: 'Lunch', prepMinutes: 15, cookMinutes: 20,
      ingredients: [{ qty: 0.5, item: ' lemon ', note: '', unit: '' }], tags: ['Quick'], notesMarkdown: '', tone: 'sage', icon: 'bowl',
      imageAlt: '', blogPostId: null, sample: false, publishedAt: null,
    });
    expect(parsed.ingredients).toEqual([{ qty: 0.5, item: 'lemon' }]);
    expect(parsed.imageAlt).toBeNull();
  });

  it('refuses unknown meals, drawings and empty steps', () => {
    const base = { ...complete, slug: 'x-y', meal: 'Lunch', prepMinutes: 1, cookMinutes: 0, tags: [], notesMarkdown: '', tone: 'sage', icon: 'bowl', imageAlt: null, blogPostId: null, sample: false, publishedAt: null };
    expect(recipeInputSchema.safeParse({ ...base, meal: 'Brunch' }).success).toBe(false);
    expect(recipeInputSchema.safeParse({ ...base, icon: 'cake' }).success).toBe(false);
    expect(recipeInputSchema.safeParse({ ...base, steps: [' '] }).success).toBe(false);
  });
});

describe('recipe publishing checks', () => {
  it('lists what is missing before a recipe can go on the website', () => {
    expect(recipePublishProblems(complete)).toEqual([]);
    expect(recipePublishProblems({ ...complete, ingredients: [], steps: [], kcal: 0, proteinNote: '' })).toEqual([
      'Add the ingredients.', 'Add the method.', 'Fill in the nutrition per serving.', 'Write the protein note.',
    ]);
    expect(recipePublishProblems({ ...complete, imagePath: 'recipes/1/a.webp', imageAlt: ' ' })).toEqual(['Describe the photo for screen readers.']);
  });
});

describe.skipIf(!url)('recipes (database)', () => {
  let db: Database;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = createDatabase(url!, { max: 1 }));
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../../../packages/db/migrations', import.meta.url)) });
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table recipes, blog_posts restart identity cascade`);
  });

  afterAll(async () => {
    await close?.();
  });

  it('creates unique web addresses', async () => {
    expect(await uniqueRecipeSlug(db, 'Chicken Bowl!')).toBe('chicken-bowl');
    await db.insert(recipes).values([{ title: 'a', slug: 'chicken-bowl' }, { title: 'b', slug: 'chicken-bowl-2' }]);
    expect(await uniqueRecipeSlug(db, 'Chicken Bowl')).toBe('chicken-bowl-3');
    expect(await uniqueRecipeSlug(db, 'Chicken Bowl', 1)).toBe('chicken-bowl');
  });

  it('gives the website only published recipes, newest first, linking only published blog posts', async () => {
    const [live, draft] = await db.insert(blogPosts).values([
      { title: 'Carbs post', slug: 'carbs', status: 'published', publishedAt: new Date('2026-09-01') },
      { title: 'Draft post', slug: 'draft-post' },
    ]).returning();
    await db.insert(recipes).values([
      { title: 'Old', slug: 'old', status: 'published', publishedAt: new Date('2026-01-01'), blogPostId: draft!.id, kcal: 300, proteinG: 10 },
      { title: 'Hidden', slug: 'hidden' },
      { title: 'New', slug: 'new', status: 'published', publishedAt: new Date('2026-09-01'), blogPostId: live!.id, kcal: 550, proteinG: 42, carbsG: 69, fatG: 9,
        ingredients: [{ qty: 300, unit: 'g', item: 'chicken' }], steps: ['Cook.'], tags: ['Quick'] },
    ]);
    const list = await listPublishedRecipes(db);
    expect(list.map((recipe) => recipe.slug)).toEqual(['new', 'old']);
    expect(list[0]).toMatchObject({
      nutrition: { kcal: 550, protein: 42, carbs: 69, fat: 9 },
      ingredients: [{ qty: 300, unit: 'g', item: 'chicken' }],
      fromPost: { slug: 'carbs', title: 'Carbs post' },
      imageUrl: null,
    });
    expect(list[1]!.fromPost).toBeNull();
  });

  it('enforces the meal, drawing, web address and a date on published recipes', async () => {
    await expect(db.insert(recipes).values({ title: 'x', slug: 'Bad Slug' })).rejects.toThrow();
    await expect(db.insert(recipes).values({ title: 'x', slug: 'ok', meal: 'Brunch' })).rejects.toThrow();
    await expect(db.insert(recipes).values({ title: 'x', slug: 'ok', icon: 'cake' })).rejects.toThrow();
    await expect(db.insert(recipes).values({ title: 'x', slug: 'ok', status: 'published' })).rejects.toThrow();
  });

  it('keeps a recipe when its blog post is deleted', async () => {
    const [post] = await db.insert(blogPosts).values({ title: 'P', slug: 'p' }).returning();
    await db.insert(recipes).values({ title: 'R', slug: 'r', blogPostId: post!.id });
    await db.delete(blogPosts);
    const rows = await db.select().from(recipes);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.blogPostId).toBeNull();
  });
});
