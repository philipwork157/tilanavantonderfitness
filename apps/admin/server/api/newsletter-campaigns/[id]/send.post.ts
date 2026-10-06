import { sendNewsletterCampaignRequestSchema } from '@tilana/contracts/admin-newsletter';
import { prepareCampaignSend } from '../../../services/newsletter-sending';

/** Locks in the recipients and starts sending in the background. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  const admin = await requireAdmin(event);
  const id = routeId(event);
  const parsed = sendNewsletterCampaignRequestSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Please review the recipients first.' });

  const result = await campaignAction(() => prepareCampaignSend(useDatabase(), id, {
    userId: admin.id,
    recipientCount: parsed.data.recipientCount,
  }));
  startCampaignRunner(id);
  setResponseStatus(event, 202);
  return result;
});
