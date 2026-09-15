import { adminProgramFileUpdateRequestSchema } from '@tilana/contracts/catalogue';
import { updateProgramFile } from '@server/services/program-storage';
import { requireAdminCatalogueMutation } from '@server/utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '@server/utils/catalogue-route';
import { readZodBody, requireRouteDatabaseId } from '@server/utils/route-validation';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const fileId = requireRouteDatabaseId(event, 'file');
  const body = await readZodBody(event, adminProgramFileUpdateRequestSchema, 'Check the file details.');
  try {
    return { file: await updateProgramFile(fileId, body, session.user.id) };
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
