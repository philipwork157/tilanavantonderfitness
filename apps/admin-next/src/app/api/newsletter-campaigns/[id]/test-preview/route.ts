import { requireAdmin } from '@/server/auth/admin';
import { getDatabase } from '@/server/db';
import { handle, HttpError, routeId, type IdContext } from '@/server/http';
import { findCampaign } from '@/server/services/newsletter-campaigns';
import { campaignEmail } from '@/server/services/newsletter-emails';
import { routeEmail } from '@/server/utils/email-routing';
import { campaignContent, devRedirectAddress, newsletterTestRecipients } from '@/server/utils/newsletter';

/**
 * Exactly what "Send test email" will send for the saved draft: who gets it,
 * the subject as it will arrive, and the email itself.
 */
export const GET = handle(async (_request: Request, context: IdContext) => {
  await requireAdmin();
  const id = await routeId(context);
  const db = getDatabase();
  const campaign = await findCampaign(db, id);
  if (!campaign) throw new HttpError(404, 'Campaign not found.');

  const recipients = newsletterTestRecipients();
  const content = await campaignContent(db, campaign, { forEmail: false });
  const email = campaignEmail(recipients[0] ?? 'test@example.com', { ...content, unsubscribeUrl: null }, { test: true });
  const routed = routeEmail(email, { devRedirectTo: devRedirectAddress() ?? undefined });
  return Response.json({
    recipients,
    subject: routed.subject,
    from: 'Tilana van Tonder',
    html: email.html ?? '',
    devRedirectTo: devRedirectAddress(),
  });
});
