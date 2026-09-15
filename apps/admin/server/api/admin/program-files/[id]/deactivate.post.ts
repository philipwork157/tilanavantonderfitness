import { adminCatalogueDeactivateRequestSchema } from '@tilana/contracts/catalogue';
import { deactivateProgramFile } from '@server/services/program-storage';
import { requireAdminCatalogueMutation } from '@server/utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '@server/utils/catalogue-route';
import { readZodBody, requireRouteDatabaseId } from '@server/utils/route-validation';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const fileId = requireRouteDatabaseId(event, 'file');
  const body = await readZodBody(event, adminCatalogueDeactivateRequestSchema, 'Check the deactivation details.', { defaultToEmptyObject: true });
  try {
    return { file: await deactivateProgramFile(fileId, body, session.user.id) };
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
