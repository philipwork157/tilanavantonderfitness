import { adminProgramMediaUploadRequestSchema } from '@tilana/contracts/catalogue';
import { initiateProgramMediaUpload } from '@server/services/program-storage';
import { requireAdminCatalogueMutation } from '@server/utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '@server/utils/catalogue-route';
import { readZodBody, requireRouteDatabaseId } from '@server/utils/route-validation';

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
