import { adminProgramMediaUploadRequestSchema } from '@tilana/contracts/catalogue';
import { initiateProgramMediaUpload } from '../../../../../services/program-storage';
import { requireAdminCatalogueMutation } from '../../../../../utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '../../../../../utils/catalogue-route';
import { readZodBody, requireRouteDatabaseId } from '../../../../../utils/route-validation';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const programId = requireRouteDatabaseId(event, 'program');
  const body = await readZodBody(event, adminProgramMediaUploadRequestSchema, 'Check the image details.');
  try {
    setResponseStatus(event, 201);
    return await initiateProgramMediaUpload(programId, body, session.user.id);
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
