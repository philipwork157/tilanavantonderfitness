import { adminProgramFileUploadFinalizeRequestSchema } from '@tilana/contracts/catalogue';
import { finalizeProgramFileUpload } from '@server/services/program-storage';
import { requireAdminCatalogueMutation } from '@server/utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '@server/utils/catalogue-route';
import { readZodBody, requireRouteDatabaseId } from '@server/utils/route-validation';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const fileId = requireRouteDatabaseId(event, 'file');
  const body = await readZodBody(event, adminProgramFileUploadFinalizeRequestSchema, 'The finalize request is invalid.', { defaultToEmptyObject: true });
  try {
    return {
      file: await finalizeProgramFileUpload(fileId, session.user.id, body.replaceFileId, body.replaceCurrentEdition),
    };
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
