import { newsletterCampaignInputSchema } from '@tilana/contracts/admin-newsletter';
import { campaignEmailHtml } from '../../../services/newsletter-emails';

/** Renders the email from the (unsaved) form so the preview follows typing. */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  await requireAdmin(event);
  routeId(event);
  const parsed = newsletterCampaignInputSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: firstIssue(parsed.error.issues, 'Please check the email.') });

  const content = await campaignContent(useDatabase(), parsed.data, { forEmail: false });
  return {
    subject: content.subject,
    previewText: content.previewText || content.post.excerpt,
    html: campaignEmailHtml({ ...content, unsubscribeUrl: `${content.websiteUrl}/newsletter/unsubscribe` }),
  };
});
