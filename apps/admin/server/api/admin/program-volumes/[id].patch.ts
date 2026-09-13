import { adminProgramVolumeUpdateRequestSchema } from '@tilana/contracts/catalogue';
import { updateProgramVolume } from '../../../services/program-catalogue';
import { requireAdminCatalogueMutation } from '../../../utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '../../../utils/catalogue-route';
import { parseDatabaseId } from '../../../utils/database-id';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const volumeId = parseDatabaseId(getRouterParam(event, 'id'));
  if (volumeId === null) throw createError({ statusCode: 400, statusMessage: 'Invalid volume identifier.' });
  const parsed = adminProgramVolumeUpdateRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Check the volume details.' });
  }
  try {
    return { volume: await updateProgramVolume(volumeId, parsed.data, session.user.id) };
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
