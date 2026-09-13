import { listPublicCataloguePrograms } from '../../services/public-catalogue';
import { applyPublicCatalogueHeaders } from '../../utils/public-catalogue';

export default defineEventHandler(async (event) => {
  applyPublicCatalogueHeaders(event);
  return { programs: await listPublicCataloguePrograms() };
});
