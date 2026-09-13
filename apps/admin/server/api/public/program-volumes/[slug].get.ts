import { catalogueSlugSchema } from '@tilana/contracts/catalogue';
import { getPublicCatalogueVolume } from '../../../services/public-catalogue';
import { applyPublicCatalogueHeaders } from '../../../utils/public-catalogue';

export default defineEventHandler(async (event) => {
  applyPublicCatalogueHeaders(event);
  const parsed = catalogueSlugSchema.safeParse(getRouterParam(event, 'slug'));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid volume slug.' });
  const volume = await getPublicCatalogueVolume(parsed.data);
  if (!volume) throw createError({ statusCode: 404, statusMessage: 'Program volume not found.' });
  return { volume };
});
