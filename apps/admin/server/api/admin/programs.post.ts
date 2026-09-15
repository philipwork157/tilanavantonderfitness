import { adminProgramCreateRequestSchema } from '@tilana/contracts/catalogue';
import { createProgram } from '../../services/program-catalogue';
import { requireAdminCatalogueMutation } from '../../utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '../../utils/catalogue-route';
import { readZodBody } from '../../utils/route-validation';

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
