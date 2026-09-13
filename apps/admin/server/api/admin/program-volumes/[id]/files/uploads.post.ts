import { adminProgramFileUploadRequestSchema } from '@tilana/contracts/catalogue';
import { initiateProgramFileUpload } from '../../../../../services/program-storage';
import { requireAdminCatalogueMutation } from '../../../../../utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '../../../../../utils/catalogue-route';
import { parseDatabaseId } from '../../../../../utils/database-id';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const volumeId = parseDatabaseId(getRouterParam(event, 'id'));
  if (volumeId === null) throw createError({ statusCode: 400, statusMessage: 'Invalid volume identifier.' });
  const parsed = adminProgramFileUploadRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Check the PDF details.' });
  }
  try {
    setResponseStatus(event, 201);
    return await initiateProgramFileUpload(volumeId, parsed.data, session.user.id);
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
