import { adminProgramStatusRequestSchema } from '@tilana/contracts/catalogue';
import { setProgramStatus } from '../../../../services/program-catalogue';
import { requireAdminCatalogueMutation } from '../../../../utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '../../../../utils/catalogue-route';
import { readZodBody, requireRouteDatabaseId } from '../../../../utils/route-validation';

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
