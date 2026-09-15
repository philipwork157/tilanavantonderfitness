import { adminCatalogueUploadFinalizeRequestSchema } from '@tilana/contracts/catalogue';
import { finalizeProgramMediaUpload } from '../../../../services/program-storage';
import { requireAdminCatalogueMutation } from '../../../../utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '../../../../utils/catalogue-route';
import { readZodBody, requireRouteDatabaseId } from '../../../../utils/route-validation';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const mediaId = requireRouteDatabaseId(event, 'media');
  await readZodBody(event, adminCatalogueUploadFinalizeRequestSchema, 'The finalize request is invalid.', { defaultToEmptyObject: true });
  try {
    return { media: await finalizeProgramMediaUpload(mediaId, session.user.id) };
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
