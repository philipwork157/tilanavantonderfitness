import type { APIRoute } from 'astro';
import { getPublishedRecipes } from '@web/utils/recipes';
import { newest, sitemapResponse, type SitemapEntry } from '@web/utils/sitemap';

// The home page, the programs and the Kitchen are rendered on request, so the
// build-time sitemap cannot list them. Linked from sitemap-index.xml.
export const prerender = false;

export const GET: APIRoute = async ({ site }) => {
  // If the admin cannot be reached, still list the pages themselves.
  const recipes = await getPublishedRecipes().catch(() => []);
  const entries: SitemapEntry[] = [
    { path: '/' },
    { path: '/program' },
    { path: '/kitchen', lastmod: newest(recipes.map((recipe) => recipe.updatedAt)) },
    ...recipes.map((recipe) => ({ path: `/kitchen/${recipe.slug}`, lastmod: recipe.updatedAt })),
  ];
  return sitemapResponse(entries, site);
};
