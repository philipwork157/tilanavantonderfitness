import { adminCatalogueDeactivateRequestSchema } from '@tilana/contracts/catalogue';
import { deactivateProgramMedia } from '../../../../services/program-storage';
import { requireAdminCatalogueMutation } from '../../../../utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '../../../../utils/catalogue-route';
import { parseDatabaseId } from '../../../../utils/database-id';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const mediaId = parseDatabaseId(getRouterParam(event, 'id'));
  if (mediaId === null) throw createError({ statusCode: 400, statusMessage: 'Invalid media identifier.' });
  const parsed = adminCatalogueDeactivateRequestSchema.safeParse((await readBody(event)) ?? {});
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Check the deactivation details.' });
  try {
    return { media: await deactivateProgramMedia(mediaId, parsed.data, session.user.id) };
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
