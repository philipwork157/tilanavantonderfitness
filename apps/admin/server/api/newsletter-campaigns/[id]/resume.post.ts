import { resumeCampaign } from '../../../services/newsletter-sending';

/** Continue a paused campaign (after fixing the problem it reported). */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  await requireAdmin(event);
  const id = routeId(event);
  if (!(await resumeCampaign(useDatabase(), id))) {
    throw createError({ statusCode: 409, statusMessage: 'This campaign is not paused.' });
  }
  startCampaignRunner(id);
  return { ok: true as const };
});
