import { adminCatalogueUploadFinalizeRequestSchema } from '@tilana/contracts/catalogue';
import { finalizeProgramMediaUpload } from '../../../../services/program-storage';
import { requireAdminCatalogueMutation } from '../../../../utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '../../../../utils/catalogue-route';
import { parseDatabaseId } from '../../../../utils/database-id';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const mediaId = parseDatabaseId(getRouterParam(event, 'id'));
  if (mediaId === null) throw createError({ statusCode: 400, statusMessage: 'Invalid media identifier.' });
  const parsed = adminCatalogueUploadFinalizeRequestSchema.safeParse((await readBody(event)) ?? {});
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'The finalize request is invalid.' });
  try {
    return { media: await finalizeProgramMediaUpload(mediaId, session.user.id) };
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
