import { adminProgramCreateRequestSchema } from '@tilana/contracts/catalogue';
import { createProgram } from '../../services/program-catalogue';
import { requireAdminCatalogueMutation } from '../../utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '../../utils/catalogue-route';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const parsed = adminProgramCreateRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Check the program details.' });
  }
  try {
    setResponseStatus(event, 201);
    return { program: await createProgram(parsed.data, session.user.id) };
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
