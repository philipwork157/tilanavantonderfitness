import { catalogueSlugSchema } from '@tilana/contracts/catalogue';
import { getPublicCatalogueProgram } from '@server/services/public-catalogue';
import { applyPublicCatalogueHeaders } from '@server/utils/public-catalogue';

export default defineEventHandler(async (event) => {
  applyPublicCatalogueHeaders(event);
  const parsed = catalogueSlugSchema.safeParse(getRouterParam(event, 'slug'));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid program slug.' });
  const program = await getPublicCatalogueProgram(parsed.data);
  if (!program) throw createError({ statusCode: 404, statusMessage: 'Program not found.' });
  return { program };
});
