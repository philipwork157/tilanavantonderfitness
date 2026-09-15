import { adminProgramUpdateRequestSchema } from '@tilana/contracts/catalogue';
import { updateProgram } from '@server/services/program-catalogue';
import { requireAdminCatalogueMutation } from '@server/utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '@server/utils/catalogue-route';
import { readZodBody, requireRouteDatabaseId } from '@server/utils/route-validation';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const programId = requireRouteDatabaseId(event, 'program');
  const body = await readZodBody(event, adminProgramUpdateRequestSchema, 'Check the program details.');
  try {
    return { program: await updateProgram(programId, body, session.user.id) };
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
