import { adminProgramUpdateRequestSchema } from '@tilana/contracts/catalogue';
import { updateProgram } from '../../../services/program-catalogue';
import { requireAdminCatalogueMutation } from '../../../utils/admin-catalogue-request';
import { throwCatalogueRouteError } from '../../../utils/catalogue-route';
import { parseDatabaseId } from '../../../utils/database-id';

export default defineEventHandler(async (event) => {
  const session = await requireAdminCatalogueMutation(event);
  const programId = parseDatabaseId(getRouterParam(event, 'id'));
  if (programId === null) throw createError({ statusCode: 400, statusMessage: 'Invalid program identifier.' });
  const parsed = adminProgramUpdateRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: parsed.error.issues[0]?.message ?? 'Check the program details.' });
  }
  try {
    return { program: await updateProgram(programId, parsed.data, session.user.id) };
  } catch (error) {
    throwCatalogueRouteError(error);
  }
});
