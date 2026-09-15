import { adminProgramFileUploadRequestSchema } from '@tilana/contracts/catalogue';
import { initiateProgramFileUpload } from '../../../../../services/program-storage';
import { requireAdminCatalogueMutation } from '../../../../../utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '../../../../../utils/catalogue-route';
import { readZodBody, requireRouteDatabaseId } from '../../../../../utils/route-validation';

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
