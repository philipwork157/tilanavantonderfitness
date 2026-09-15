import { adminProgramMediaUpdateRequestSchema } from '@tilana/contracts/catalogue';
import { updateProgramMedia } from '@server/services/program-storage';
import { requireAdminCatalogueMutation } from '@server/utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '@server/utils/catalogue-route';
import { readZodBody, requireRouteDatabaseId } from '@server/utils/route-validation';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const mediaId = requireRouteDatabaseId(event, 'media');
  const body = await readZodBody(event, adminProgramMediaUpdateRequestSchema, 'Check the media details.');
  try {
    return { media: await updateProgramMedia(mediaId, body, session.user.id) };
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
