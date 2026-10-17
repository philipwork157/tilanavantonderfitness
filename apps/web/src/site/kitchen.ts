import { RECIPE_MEALS, type PublicRecipe } from '@tilana/contracts/kitchen';
import { getPublishedRecipes } from '@web/utils/recipes';
import { href } from './config';
import type { RecipeCardData } from './components/RecipeCard';

/** A published recipe, as the admin sends it (Tilana edits recipes in the admin's Kitchen page). */
export type Recipe = PublicRecipe;

export const meals = RECIPE_MEALS;

/**
 * Published recipes, newest first. Never throws: if the admin API cannot be
 * reached and there is no saved copy, `ok` is false and the page shows a
 * short "please try again" note instead.
 */
export async function loadRecipes(): Promise<{ recipes: Recipe[]; ok: boolean }> {
  try {
    const recipes = await getPublishedRecipes();
    return { recipes: [...recipes].sort((a, b) => b.publishedAt.valueOf() - a.publishedAt.valueOf()), ok: true };
  } catch {
    // live-api.ts has already logged the failure with its request ID.
    return { recipes: [], ok: false };
  }
}

/** Browsers may reuse a kitchen page for a minute; the recipes are cached on Cloudflare. */
export function setKitchenCacheHeaders(headers: Headers): void {
  headers.set('cache-control', 'public, max-age=60');
}

/** Other recipes to suggest: the closest in protein first, so a hearty dinner suggests other hearty meals. */
export function relatedRecipes(recipe: Recipe, all: Recipe[], count = 3): Recipe[] {
  return all
    .filter((other) => other.slug !== recipe.slug)
    .sort((a, b) => Math.abs(a.nutrition.protein - recipe.nutrition.protein) - Math.abs(b.nutrition.protein - recipe.nutrition.protein))
    .slice(0, count);
}

export function toRecipeCard(recipe: Recipe): RecipeCardData {
  return {
    slug: recipe.slug,
    href: href(`/kitchen/${recipe.slug}`),
    title: recipe.title,
    description: recipe.description,
    meal: recipe.meal,
    protein: recipe.nutrition.protein,
    kcal: recipe.nutrition.kcal,
    minutes: recipe.prepMinutes + recipe.cookMinutes,
    servings: recipe.servings,
    tone: recipe.tone,
    icon: recipe.icon,
    image: recipe.imageUrl ?? undefined,
    imageAlt: recipe.imageAlt ?? undefined,
  };
}

const isoMinutes = (minutes: number) => `PT${Math.max(0, Math.round(minutes))}M`;

/** "300 g chicken breast, cut into strips" */
export function ingredientLine(ingredient: Recipe['ingredients'][number]): string {
  const amount = [ingredient.qty, ingredient.unit].filter((part) => part !== undefined && part !== '').join(' ');
  return [amount, ingredient.item].filter(Boolean).join(' ') + (ingredient.note ? `, ${ingredient.note}` : '');
}

/** schema.org Recipe, so search engines can show the time, calories and photo. */
export function recipeStructuredData(recipe: Recipe, url: string, authorId: string) {
  return {
    '@type': 'Recipe',
    '@id': `${url}#recipe`,
    name: recipe.title,
    description: recipe.description,
    ...(recipe.imageUrl ? { image: [recipe.imageUrl] } : {}),
    author: { '@id': authorId },
    datePublished: recipe.publishedAt.toISOString(),
    recipeCategory: recipe.meal,
    recipeYield: `${recipe.servings} serving${recipe.servings === 1 ? '' : 's'}`,
    prepTime: isoMinutes(recipe.prepMinutes),
    ...(recipe.cookMinutes > 0 ? { cookTime: isoMinutes(recipe.cookMinutes) } : {}),
    totalTime: isoMinutes(recipe.prepMinutes + recipe.cookMinutes),
    ...(recipe.tags.length ? { keywords: recipe.tags.join(', ') } : {}),
    nutrition: {
      '@type': 'NutritionInformation',
      servingSize: '1 serving',
      calories: `${recipe.nutrition.kcal} calories`,
      proteinContent: `${recipe.nutrition.protein} g`,
      carbohydrateContent: `${recipe.nutrition.carbs} g`,
      fatContent: `${recipe.nutrition.fat} g`,
    },
    recipeIngredient: recipe.ingredients.map(ingredientLine),
    recipeInstructions: recipe.steps.map((text) => ({ '@type': 'HowToStep', text })),
  };
}
