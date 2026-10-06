import { campaignEmail } from '../../../services/newsletter-emails';
import { findCampaign } from '../../../services/newsletter-campaigns';
import { routeEmail } from '../../../utils/email-routing';

/**
 * Exactly what "Send test email" will send for the saved draft: who gets it,
 * the subject as it will arrive, and the email itself.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const id = routeId(event);
  const db = useDatabase();
  const campaign = await findCampaign(db, id);
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found.' });

  const recipients = newsletterTestRecipients();
  const content = await campaignContent(db, campaign, { forEmail: false });
  const email = campaignEmail(recipients[0] ?? 'test@example.com', { ...content, unsubscribeUrl: null }, { test: true });
  const routed = routeEmail(email, { devRedirectTo: devRedirectAddress() ?? undefined });

  return {
    recipients,
    subject: routed.subject,
    from: 'Tilana van Tonder',
    html: email.html ?? '',
    devRedirectTo: devRedirectAddress(),
  };
});
