import 'server-only';
import { and, desc, eq, inArray, like, ne, or } from 'drizzle-orm';
import { blogPosts, recipes, type Database, type Recipe } from '@tilana/db';
import { slugify, type BlogStatus } from '@tilana/contracts/blog';
import type { PublicRecipe, RecipeIcon, RecipeMeal, RecipeTone } from '@tilana/contracts/kitchen';
import { blogImagePublicUrl } from '../utils/blog-images';
import { publicUrl } from '../utils/public-url';

/*
 * Kitchen recipes. Tilana edits them in the admin; the website's /kitchen
 * pages read the published ones from /api/public/recipes.
 */

/** A unique web address based on the title: "my-recipe", then "my-recipe-2", ... */
export async function uniqueRecipeSlug(db: Database, base: string, exceptId?: number): Promise<string> {
  const root = slugify(base) || 'recipe';
  const rows = await db.select({ slug: recipes.slug }).from(recipes).where(and(
    or(eq(recipes.slug, root), like(recipes.slug, `${root}-%`)),
    exceptId ? ne(recipes.id, exceptId) : undefined,
  ));
  const taken = new Set(rows.map((row) => row.slug));
  if (!taken.has(root)) return root;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${root}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export async function findRecipe(db: Database, id: number): Promise<Recipe | undefined> {
  const [recipe] = await db.select().from(recipes).where(eq(recipes.id, id));
  return recipe;
}

type PublishCheck = Pick<Recipe, 'title' | 'description' | 'servings' | 'kcal' | 'proteinG' | 'carbsG' | 'fatG' | 'proteinNote' | 'ingredients' | 'steps' | 'imagePath' | 'imageAlt'>;

/** Reasons a recipe cannot be on the website yet; empty when it is ready. */
export function recipePublishProblems(recipe: PublishCheck): string[] {
  const problems: string[] = [];
  if (recipe.title.trim().length < 3) problems.push('Add a title.');
  if (recipe.description.trim().length < 10) problems.push('Add a short description.');
  if (!recipe.ingredients.length) problems.push('Add the ingredients.');
  if (!recipe.steps.length) problems.push('Add the method.');
  if (recipe.kcal <= 0 || recipe.proteinG + recipe.carbsG + recipe.fatG <= 0) problems.push('Fill in the nutrition per serving.');
  if (recipe.proteinNote.trim().length < 10) problems.push('Write the protein note.');
  if (recipe.imagePath && !recipe.imageAlt?.trim()) problems.push('Describe the photo for screen readers.');
  return problems;
}

/** Admin view of a recipe: the row plus its photo address. */
export function toAdminRecipe(recipe: Recipe) {
  return {
    id: recipe.id,
    slug: recipe.slug,
    title: recipe.title,
    description: recipe.description,
    meal: recipe.meal as RecipeMeal,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    servings: recipe.servings,
    kcal: recipe.kcal,
    proteinG: recipe.proteinG,
    carbsG: recipe.carbsG,
    fatG: recipe.fatG,
    proteinNote: recipe.proteinNote,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    tags: recipe.tags,
    notesMarkdown: recipe.notesMarkdown,
    tone: recipe.tone as RecipeTone,
    icon: recipe.icon as RecipeIcon,
    imageUrl: blogImagePublicUrl(recipe.imagePath),
    imageAlt: recipe.imageAlt,
    blogPostId: recipe.blogPostId,
    sample: recipe.sample,
    status: recipe.status,
    /** The recipe on the website, while it is published. */
    publicUrl: recipe.status === 'published' ? publicUrl(`/kitchen/${recipe.slug}`) : null,
    publishedAt: recipe.publishedAt,
    updatedAt: recipe.updatedAt,
  };
}

/** Published recipes for the website, newest first, with their blog post when that post is published. */
export async function listPublishedRecipes(db: Database): Promise<PublicRecipe[]> {
  const rows = await db.select().from(recipes)
    .where(eq(recipes.status, 'published'))
    .orderBy(desc(recipes.publishedAt), desc(recipes.id));
  const postIds = [...new Set(rows.map((row) => row.blogPostId).filter((id): id is number => id !== null))];
  const posts = postIds.length
    ? await db.select({ id: blogPosts.id, slug: blogPosts.slug, title: blogPosts.title, status: blogPosts.status })
      .from(blogPosts).where(inArray(blogPosts.id, postIds))
    : [];
  const published = new Map(posts.filter((post) => (post.status as BlogStatus) === 'published').map((post) => [post.id, post]));
  return rows.map((recipe) => {
    const post = recipe.blogPostId ? published.get(recipe.blogPostId) : undefined;
    return {
      slug: recipe.slug,
      title: recipe.title,
      description: recipe.description,
      meal: recipe.meal as RecipeMeal,
      prepMinutes: recipe.prepMinutes,
      cookMinutes: recipe.cookMinutes,
      servings: recipe.servings,
      nutrition: { kcal: recipe.kcal, protein: recipe.proteinG, carbs: recipe.carbsG, fat: recipe.fatG },
      proteinNote: recipe.proteinNote,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      tags: recipe.tags,
      notesMarkdown: recipe.notesMarkdown,
      tone: recipe.tone as RecipeTone,
      icon: recipe.icon as RecipeIcon,
      imageUrl: blogImagePublicUrl(recipe.imagePath),
      imageAlt: recipe.imageAlt,
      imageWidth: recipe.imageWidth,
      imageHeight: recipe.imageHeight,
      fromPost: post ? { slug: post.slug, title: post.title } : null,
      sample: recipe.sample,
      publishedAt: recipe.publishedAt!,
      updatedAt: recipe.updatedAt,
    };
  });
}
