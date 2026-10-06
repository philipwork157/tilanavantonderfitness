import { newsletterCampaignInputSchema } from '@tilana/contracts/admin-newsletter';
import { updateCampaign } from '../../services/newsletter-campaigns';

/** Save a draft. Clears the test, so a new test is needed before sending. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  await requireAdmin(event);
  const id = routeId(event);
  const parsed = newsletterCampaignInputSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: firstIssue(parsed.error.issues, 'Please check the email.') });
  const campaign = await campaignAction(() => updateCampaign(useDatabase(), id, parsed.data));
  return { testSentAt: campaign.testSentAt, updatedAt: campaign.updatedAt };
});
