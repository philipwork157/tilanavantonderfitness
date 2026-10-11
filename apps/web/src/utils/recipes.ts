import { publicRecipesResponseSchema, type PublicRecipe } from '@tilana/contracts/kitchen';
import { createLiveLoader } from './live-api';

/**
 * Published kitchen recipes from the admin API, read live when a kitchen page
 * is opened (five-minute shared cache, last good copy while the API is down).
 */
export const getPublishedRecipes: () => Promise<PublicRecipe[]> = createLiveLoader({
  path: '/api/public/recipes',
  label: 'Recipes',
  parse: (body) => publicRecipesResponseSchema.parse(body).recipes,
});
