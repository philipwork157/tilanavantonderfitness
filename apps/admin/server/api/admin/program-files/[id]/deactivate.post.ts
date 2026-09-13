import { adminCatalogueDeactivateRequestSchema } from '@tilana/contracts/catalogue';
import { deactivateProgramFile } from '../../../../services/program-storage';
import { requireAdminCatalogueMutation } from '../../../../utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '../../../../utils/catalogue-route';
import { parseDatabaseId } from '../../../../utils/database-id';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const fileId = parseDatabaseId(getRouterParam(event, 'id'));
  if (fileId === null) throw createError({ statusCode: 400, statusMessage: 'Invalid file identifier.' });
  const parsed = adminCatalogueDeactivateRequestSchema.safeParse((await readBody(event)) ?? {});
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Check the deactivation details.' });
  try {
    return { file: await deactivateProgramFile(fileId, parsed.data, session.user.id) };
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
