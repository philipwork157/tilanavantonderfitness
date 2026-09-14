import { getAdminOpenApiDocument } from '../../services/api-documentation';
import { requireAdmin } from '../../utils/admin-auth';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  setHeader(event, 'Cache-Control', 'private, no-store');
  return getAdminOpenApiDocument();
});
