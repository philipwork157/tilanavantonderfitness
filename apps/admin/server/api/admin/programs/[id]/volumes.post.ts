import { adminProgramVolumeCreateRequestSchema } from '@tilana/contracts/catalogue';
import { createProgramVolume } from '../../../../services/program-catalogue';
import { requireAdminCatalogueMutation } from '../../../../utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '../../../../utils/catalogue-route';
import { readZodBody, requireRouteDatabaseId } from '../../../../utils/route-validation';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const programId = requireRouteDatabaseId(event, 'program');
  const body = await readZodBody(event, adminProgramVolumeCreateRequestSchema, 'Check the volume details.');
  try {
    setResponseStatus(event, 201);
    return { volume: await createProgramVolume(programId, body, session.user.id) };
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
