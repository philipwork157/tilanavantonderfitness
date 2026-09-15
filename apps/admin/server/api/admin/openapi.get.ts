import { getAdminOpenApiDocument } from '@server/services/api-documentation';
import { requireAdmin } from '@server/utils/admin-auth';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  setHeader(event, 'Cache-Control', 'private, no-store');
  return getAdminOpenApiDocument();
});
