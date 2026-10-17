import { newsletterCampaignInputSchema } from '@tilana/contracts/admin-newsletter';
import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { campaignEmailHtml } from '@/server/services/newsletter-emails';
import { campaignContent } from '@/server/utils/newsletter';
import { firstIssue } from '@/server/utils/newsletter-errors';

/** Renders the email from the (unsaved) form so the preview follows typing. */
export const POST = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  await routeId(context);
  const parsed = newsletterCampaignInputSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, firstIssue(parsed.error.issues, 'Please check the email.'));
  const content = await campaignContent(getDatabase(), parsed.data, { forEmail: false });
  return Response.json({
    subject: content.subject,
    previewText: content.previewText || content.post.excerpt,
    html: campaignEmailHtml({ ...content, unsubscribeUrl: `${content.websiteUrl}/newsletter/unsubscribe` }),
  });
});
