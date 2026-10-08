import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { serverConfig } from '@/server/config';
import { getDatabase } from '@/server/db';
import { handle, HttpError, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { programDeliveryEmail } from '@/server/services/program-emails';
import { findVolume } from '@/server/services/programs';
import { sendEmail } from '@/server/utils/email';
import { newsletterTestRecipients, websiteUrl } from '@/server/utils/newsletter';
import { downloadProgramFile } from '@/server/utils/program-files';

/**
 * Sends the exact email customers will receive for this volume, with the
 * real PDF attached, to the test recipients (the developer in development).
 */
export const POST = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  const admin = await requireAdmin();
  const volume = await findVolume(getDatabase(), await routeId(context));
  if (!volume) throw new HttpError(404, 'Volume not found.');
  if (!volume.filePath || !volume.fileName) throw new HttpError(400, 'Upload the PDF first.');

  const recipients = newsletterTestRecipients();
  if (!recipients.length) throw new HttpError(503, 'Set NEWSLETTER_TEST_TO to receive test emails.');
  const site = websiteUrl();
  const data = await downloadProgramFile(volume.filePath);
  const attachment = { fileName: volume.fileName, contentType: 'application/pdf', data: new Uint8Array(data) };
  const replyTo = serverConfig().contactNotifyTo || undefined;

  try {
    for (const to of recipients) {
      await sendEmail(programDeliveryEmail(to, {
        firstName: admin.firstName || 'there',
        orderNumber: null,
        programs: [volume.name],
        websiteUrl: site,
        refundPolicyUrl: `${site}/refund-policy`,
      }, [attachment], { test: true, replyTo }));
    }
  } catch (error) {
    console.error('Program test email failed', error);
    throw new HttpError(502, 'The test email could not be sent. Please try again.');
  }
  return Response.json({ recipients });
});
