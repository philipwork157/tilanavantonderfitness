import { campaignEmail } from '../../../services/newsletter-emails';
import { findCampaign, markTestSent } from '../../../services/newsletter-campaigns';

/** Sends the saved draft to NUXT_NEWSLETTER_TEST_TO (Tilana and the developer). */
export default defineEventHandler(async (event) => {
  assertSameOrigin(event);
  await requireAdmin(event);
  const id = routeId(event);
  const db = useDatabase();

  const campaign = await findCampaign(db, id);
  if (!campaign) throw createError({ statusCode: 404, statusMessage: 'Campaign not found.' });
  if (campaign.status !== 'draft') throw createError({ statusCode: 409, statusMessage: 'This campaign has already been sent.' });

  const recipients = newsletterTestRecipients();
  if (!recipients.length) throw createError({ statusCode: 503, statusMessage: 'Set NUXT_NEWSLETTER_TEST_TO to receive test emails.' });

  const content = await campaignContent(db, campaign, { forEmail: true });
  try {
    for (const to of recipients) {
      await sendEmail(campaignEmail(to, { ...content, unsubscribeUrl: null }, { test: true }));
    }
  }
  catch (error) {
    console.error('Newsletter test email failed', error);
    throw createError({ statusCode: 502, statusMessage: 'The test email could not be sent. Please try again.' });
  }
  const sentAt = new Date();
  await markTestSent(db, id, sentAt);
  return { testSentAt: sentAt, recipients };
});
