import { applyPublicCatalogueHeaders } from '../../utils/public-catalogue';

export default defineEventHandler((event) => {
  applyPublicCatalogueHeaders(event);
  setResponseStatus(event, 204);
  return null;
});
