import { sendNewsletterCampaignRequestSchema } from '@tilana/contracts/admin-newsletter';
import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { prepareCampaignSend } from '@/server/services/newsletter-sending';
import { startCampaignRunner } from '@/server/utils/newsletter';
import { campaignAction } from '@/server/utils/newsletter-errors';

/** Locks in the recipients and starts sending in the background. */
export const POST = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  const admin = await requireAdmin();
  const id = await routeId(context);
  const parsed = sendNewsletterCampaignRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'Please review the recipients first.');
  const result = await campaignAction(() => prepareCampaignSend(getDatabase(), id, {
    userId: admin.id,
    recipientCount: parsed.data.recipientCount,
  }));
  startCampaignRunner(id);
  return Response.json(result, { status: 202 });
});
