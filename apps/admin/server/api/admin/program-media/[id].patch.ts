import { adminProgramMediaUpdateRequestSchema } from '@tilana/contracts/catalogue';
import { updateProgramMedia } from '../../../services/program-storage';
import { requireAdminCatalogueMutation } from '../../../utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '../../../utils/catalogue-route';
import { readZodBody, requireRouteDatabaseId } from '../../../utils/route-validation';

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
