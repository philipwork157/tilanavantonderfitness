import { adminProgramMediaUpdateRequestSchema } from '@tilana/contracts/catalogue';
import { updateProgramMedia } from '../../../services/program-storage';
import { requireAdminCatalogueMutation } from '../../../utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '../../../utils/catalogue-route';
import { parseDatabaseId } from '../../../utils/database-id';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const mediaId = parseDatabaseId(getRouterParam(event, 'id'));
  if (mediaId === null) throw createError({ statusCode: 400, statusMessage: 'Invalid media identifier.' });
  const parsed = adminProgramMediaUpdateRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Check the media details.' });
  }
  try {
    return { media: await updateProgramMedia(mediaId, parsed.data, session.user.id) };
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
