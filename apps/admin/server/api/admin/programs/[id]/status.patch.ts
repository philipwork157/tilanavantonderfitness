import { adminProgramStatusRequestSchema } from '@tilana/contracts/catalogue';
import { setProgramStatus } from '@server/services/program-catalogue';
import { requireAdminCatalogueMutation } from '@server/utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '@server/utils/catalogue-route';
import { readZodBody, requireRouteDatabaseId } from '@server/utils/route-validation';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const programId = requireRouteDatabaseId(event, 'program');
  const body = await readZodBody(event, adminProgramStatusRequestSchema, 'Select a valid program status.');
  try {
    return { program: await setProgramStatus(programId, body, session.user.id) };
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
