import { adminProgramVolumeUpdateRequestSchema } from '@tilana/contracts/catalogue';
import { updateProgramVolume } from '../../../services/program-catalogue';
import { requireAdminCatalogueMutation } from '../../../utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '../../../utils/catalogue-route';
import { readZodBody, requireRouteDatabaseId } from '../../../utils/route-validation';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const volumeId = requireRouteDatabaseId(event, 'volume');
  const body = await readZodBody(event, adminProgramVolumeUpdateRequestSchema, 'Check the volume details.');
  try {
    return { volume: await updateProgramVolume(volumeId, body, session.user.id) };
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
