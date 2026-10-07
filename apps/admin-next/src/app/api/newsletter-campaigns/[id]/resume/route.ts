import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { resumeCampaign } from '@/server/services/newsletter-sending';
import { startCampaignRunner } from '@/server/utils/newsletter';

/** Continue a paused campaign (after fixing the problem it reported). */
export const POST = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  const id = await routeId(context);
  if (!(await resumeCampaign(getDatabase(), id))) throw new HttpError(409, 'This campaign is not paused.');
  startCampaignRunner(id);
  return Response.json({ ok: true });
});
