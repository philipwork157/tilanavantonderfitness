import { adminProgramMediaUploadRequestSchema } from '@tilana/contracts/catalogue';
import { initiateProgramMediaUpload } from '../../../../../services/program-storage';
import { requireAdminCatalogueMutation } from '../../../../../utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '../../../../../utils/catalogue-route';
import { parseDatabaseId } from '../../../../../utils/database-id';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const programId = parseDatabaseId(getRouterParam(event, 'id'));
  if (programId === null) throw createError({ statusCode: 400, statusMessage: 'Invalid program identifier.' });
  const parsed = adminProgramMediaUploadRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Check the image details.' });
  }
  try {
    setResponseStatus(event, 201);
    return await initiateProgramMediaUpload(programId, parsed.data, session.user.id);
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
