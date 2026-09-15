import { adminProgramFileUpdateRequestSchema } from '@tilana/contracts/catalogue';
import { updateProgramFile } from '../../../services/program-storage';
import { requireAdminCatalogueMutation } from '../../../utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '../../../utils/catalogue-route';
import { readZodBody, requireRouteDatabaseId } from '../../../utils/route-validation';

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
