import { listPublicCataloguePrograms } from '@server/services/public-catalogue';
import { applyPublicCatalogueHeaders } from '@server/utils/public-catalogue';

export default defineEventHandler(async (event) => {
  applyPublicCatalogueHeaders(event);
  return { programs: await listPublicCataloguePrograms() };
});
