import { getProgramPublicationChecklist } from '@server/services/program-catalogue';
import { requireAdmin } from '@server/utils/admin-auth';
import { requireRouteDatabaseId } from '@server/utils/route-validation';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const programId = requireRouteDatabaseId(event, 'program');
  const checklist = await getProgramPublicationChecklist(programId);
  if (!checklist) throw createError({ statusCode: 404, statusMessage: 'Program not found.' });
  return { checklist };
});
