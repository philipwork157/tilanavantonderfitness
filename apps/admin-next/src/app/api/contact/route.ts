import { contactFormRequestSchema } from '@tilana/contracts/contact';
import { createAttemptLimiter } from '@/server/auth/admin-access';
import { isDevelopment, serverConfig } from '@/server/config';
import { websitePreflight, websiteRoute } from '@/server/cors';
import { getDatabase } from '@/server/db';
import { clientIp, HttpError, readJson } from '@/server/http';
import { createInquiry, inquiryNotificationEmail, matchInquiryOrders } from '@/server/services/inquiries';
import { logger } from '@/server/logger';
import { sendEmail } from '@/server/utils/email';
import { verifyTurnstileToken } from '@/server/utils/turnstile';

// Per visitor IP: generous for real people, slows down bulk spam.
const submissions = createAttemptLimiter({ maxAttempts: 5, windowMs: 10 * 60 * 1000 });

/** Public website contact form. */
export const POST = websiteRoute(async (request) => {
  const parsed = contactFormRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'Please check the highlighted fields.');
  const input = parsed.data;

  // Honeypot: real visitors never fill the hidden "website" field. Pretend success.
  if (input.website) return Response.json({ ok: true });

  const ip = clientIp(request);
  if (submissions.isBlocked(ip)) {
    throw new HttpError(429, 'Too many messages in a short time. Please try again a little later.');
  }
  submissions.record(ip);

  const config = serverConfig();
  if (config.turnstileSecretKey) {
    const valid = await verifyTurnstileToken(input.turnstileToken, { secret: config.turnstileSecretKey, remoteIp: ip });
    if (!valid) throw new HttpError(400, 'Please complete the security check.');
  } else if (!isDevelopment) {
    // Production must never accept the form without the spam check.
    throw new HttpError(503, 'The contact form is not available right now. Please email instead.');
  }

  const notifyTo = config.contactNotifyTo;
  const db = getDatabase();
  await createInquiry(db, input, {
    notify: async (inquiry) => {
      if (!notifyTo) throw new Error('CONTACT_NOTIFY_TO is not set.');
      // Order enquiries: add the matching order to Tilana's email. A lookup
      // problem never stops the email.
      const match = inquiry.orderTopic
        ? await matchInquiryOrders(db, inquiry).catch((error: unknown) => {
            logger.warn({ err: error }, 'Could not match the enquiry to an order');
            return null;
          })
        : null;
      await sendEmail(inquiryNotificationEmail(inquiry, notifyTo, match));
    },
  });

  // The enquiry is saved even if the email failed; Tilana sees it in the admin.
  return Response.json({ ok: true });
});

export const OPTIONS = websitePreflight;
