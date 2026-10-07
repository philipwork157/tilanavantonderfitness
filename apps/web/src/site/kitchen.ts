import { getCollection, type CollectionEntry } from 'astro:content';
import { href } from './config';
import type { RecipeCardData } from './components/RecipeCard';

export type Recipe = CollectionEntry<'siteKitchen'>;

export const meals = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Training fuel'] as const;

/** Newest first, drafts hidden. */
export async function getRecipes(): Promise<Recipe[]> {
  const all = await getCollection('siteKitchen', ({ data }) => !data.draft);
  return all.sort((a, b) => b.data.publishedAt.valueOf() - a.data.publishedAt.valueOf());
}

export function toRecipeCard(recipe: Recipe): RecipeCardData {
  const d = recipe.data;
  return {
    slug: recipe.id,
    href: href(`/kitchen/${recipe.id}`),
    title: d.title,
    description: d.description,
    meal: d.meal,
    protein: d.nutrition.protein,
    kcal: d.nutrition.kcal,
    minutes: d.prepMinutes + d.cookMinutes,
    servings: d.servings,
    tone: d.tone,
    icon: d.icon,
    image: d.image,
    imageAlt: d.imageAlt,
  };
}
