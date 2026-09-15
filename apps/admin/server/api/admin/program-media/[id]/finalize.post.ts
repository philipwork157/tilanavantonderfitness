import { adminCatalogueUploadFinalizeRequestSchema } from '@tilana/contracts/catalogue';
import { finalizeProgramMediaUpload } from '@server/services/program-storage';
import { requireAdminCatalogueMutation } from '@server/utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '@server/utils/catalogue-route';
import { readZodBody, requireRouteDatabaseId } from '@server/utils/route-validation';

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
