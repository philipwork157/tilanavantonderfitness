import { adminProgramVolumeCreateRequestSchema } from '@tilana/contracts/catalogue';
import { createProgramVolume } from '../../../../services/program-catalogue';
import { requireAdminCatalogueMutation } from '../../../../utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '../../../../utils/catalogue-route';
import { parseDatabaseId } from '../../../../utils/database-id';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const programId = parseDatabaseId(getRouterParam(event, 'id'));
  if (programId === null) throw createError({ statusCode: 400, statusMessage: 'Invalid program identifier.' });
  const parsed = adminProgramVolumeCreateRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Check the volume details.' });
  }
  try {
    setResponseStatus(event, 201);
    return { volume: await createProgramVolume(programId, parsed.data, session.user.id) };
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
