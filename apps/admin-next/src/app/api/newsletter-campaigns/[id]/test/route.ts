import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { findCampaign, markTestSent } from '@/server/services/newsletter-campaigns';
import { campaignEmail } from '@/server/services/newsletter-emails';
import { sendEmail } from '@/server/utils/email';
import { campaignContent, newsletterTestRecipients } from '@/server/utils/newsletter';

/** Sends the saved draft to NEWSLETTER_TEST_TO (Tilana and the developer). */
export const POST = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  const id = await routeId(context);
  const db = getDatabase();
  const campaign = await findCampaign(db, id);
  if (!campaign) throw new HttpError(404, 'Campaign not found.');
  if (campaign.status !== 'draft') throw new HttpError(409, 'This campaign has already been sent.');

  const recipients = newsletterTestRecipients();
  if (!recipients.length) throw new HttpError(503, 'Set NEWSLETTER_TEST_TO to receive test emails.');

  const content = await campaignContent(db, campaign, { forEmail: true });
  try {
    for (const to of recipients) {
      await sendEmail(campaignEmail(to, { ...content, unsubscribeUrl: null }, { test: true }));
    }
  } catch (error) {
    console.error('Newsletter test email failed', error);
    throw new HttpError(502, 'The test email could not be sent. Please try again.');
  }

  const sentAt = new Date();
  await markTestSent(db, id, sentAt);
  return Response.json({ testSentAt: sentAt, recipients });
});
