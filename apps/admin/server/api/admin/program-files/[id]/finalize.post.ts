import { adminProgramFileUploadFinalizeRequestSchema } from '@tilana/contracts/catalogue';
import { finalizeProgramFileUpload } from '../../../../services/program-storage';
import { requireAdminCatalogueMutation } from '../../../../utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '../../../../utils/catalogue-route';
import { parseDatabaseId } from '../../../../utils/database-id';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const fileId = parseDatabaseId(getRouterParam(event, 'id'));
  if (fileId === null) throw createError({ statusCode: 400, statusMessage: 'Invalid file identifier.' });
  const parsed = adminProgramFileUploadFinalizeRequestSchema.safeParse((await readBody(event)) ?? {});
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'The finalize request is invalid.' });
  try {
    return {
      file: await finalizeProgramFileUpload(fileId, session.user.id, parsed.data.replaceFileId),
    };
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
