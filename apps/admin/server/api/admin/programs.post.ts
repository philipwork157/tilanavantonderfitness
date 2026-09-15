import { adminProgramCreateRequestSchema } from '@tilana/contracts/catalogue';
import { createProgram } from '@server/services/program-catalogue';
import { requireAdminCatalogueMutation } from '@server/utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '@server/utils/catalogue-route';
import { readZodBody } from '@server/utils/route-validation';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const body = await readZodBody(event, adminProgramCreateRequestSchema, 'Check the program details.');
  try {
    setResponseStatus(event, 201);
    return { program: await createProgram(body, session.user.id) };
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
