import { adminProgramFileUploadRequestSchema } from '@tilana/contracts/catalogue';
import { initiateProgramFileUpload } from '@server/services/program-storage';
import { requireAdminCatalogueMutation } from '@server/utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '@server/utils/catalogue-route';
import { readZodBody, requireRouteDatabaseId } from '@server/utils/route-validation';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const volumeId = requireRouteDatabaseId(event, 'volume');
  const body = await readZodBody(event, adminProgramFileUploadRequestSchema, 'Check the PDF details.');
  try {
    setResponseStatus(event, 201);
    return await initiateProgramFileUpload(volumeId, body, session.user.id);
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
