import { deleteDraftCampaign } from '../../services/newsletter-campaigns';

export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  await requireAdmin(event);
  if (!(await deleteDraftCampaign(useDatabase(), routeId(event)))) {
    throw createError({ statusCode: 409, statusMessage: 'Only drafts can be deleted.' });
  }
  return { ok: true as const };
});
