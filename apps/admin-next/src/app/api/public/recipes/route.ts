import { getDatabase } from '@/server/db';
import { handle } from '@/server/http';
import { listPublishedRecipes } from '@/server/services/recipes';

/**
 * Published kitchen recipes for the public website. Only published recipes
 * are exposed; the website escapes text and renders the notes' Markdown
 * safely. Cached for a minute (see next.config.ts headers).
 */
export const GET = handle(async () => Response.json({ recipes: await listPublishedRecipes(getDatabase()) }));
