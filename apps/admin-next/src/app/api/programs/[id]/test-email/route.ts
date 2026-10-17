import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { serverConfig } from '@/server/config';
import { getDatabase } from '@/server/db';
import { handle, HttpError, routeId, sameOriginOnly, type IdContext } from '@/server/http';
import { logger } from '@/server/logger';
import { programDeliveryEmail } from '@/server/services/program-emails';
import { findProgram, programLabel } from '@/server/services/programs';
import { sendEmail } from '@/server/utils/email';
import { newsletterTestRecipients, websiteUrl } from '@/server/utils/newsletter';
import { PdfStampError, stampProgramPdf } from '@/server/utils/pdf-stamp';
import { downloadProgramFile } from '@/server/utils/program-files';

/**
 * Sends the exact email customers will receive for this program, with the
 * real PDF attached and personalised like a buyer's copy (with the admin's
 * name and order number TEST), to the test recipients.
 */
export const POST = handle(async (request: Request, context: IdContext) => {
  sameOriginOnly(request, isSameOrigin);
  const admin = await requireAdmin();
  const program = await findProgram(getDatabase(), await routeId(context));
  if (!program) throw new HttpError(404, 'Program not found.');
  if (!program.filePath || !program.fileName) throw new HttpError(400, 'Upload the PDF first.');

  const recipients = newsletterTestRecipients();
  if (!recipients.length) throw new HttpError(503, 'Set NEWSLETTER_TEST_TO to receive test emails.');
  const site = websiteUrl();
  const name = [admin.firstName, admin.lastName].filter(Boolean).join(' ') || 'Test Buyer';
  const { data } = await stampProgramPdf(await downloadProgramFile(program.filePath), { name, orderNumber: 'TEST', purchasedAt: new Date() })
    .catch((error: unknown) => {
      if (error instanceof PdfStampError) throw new HttpError(400, error.message);
      throw error;
    });
  const attachment = { fileName: program.fileName, contentType: 'application/pdf', data: new Uint8Array(data) };
  const replyTo = serverConfig().contactNotifyTo || undefined;

  try {
    for (const to of recipients) {
      await sendEmail(programDeliveryEmail(to, {
        firstName: admin.firstName || 'there',
        orderNumber: null,
        programs: [programLabel(program.name, program.volume)],
        websiteUrl: site,
        refundPolicyUrl: `${site}/refund-policy`,
      }, [attachment], { test: true, replyTo }));
    }
  } catch (error) {
    logger.error({ err: error }, 'Program test email failed');
    throw new HttpError(502, 'The test email could not be sent. Please try again.');
  }
  return Response.json({ recipients });
});
