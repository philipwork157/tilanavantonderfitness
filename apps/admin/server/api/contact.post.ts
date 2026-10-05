import { contactFormRequestSchema } from '@tilana/contracts/contact';
import { createAttemptLimiter } from '../utils/admin-access';
import { createInquiry, inquiryNotificationEmail } from '../services/inquiries';

// Per visitor IP: generous for real people, slows down bulk spam.
const submissions = createAttemptLimiter({ maxAttempts: 5, windowMs: 10 * 60 * 1000 });

/** Public website contact form. Origin/CORS checks run in middleware/website-cors.ts. */
export default defineEventHandler(async (event) => {
  const parsed = contactFormRequestSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Please check the highlighted fields.' });
  }
  const input = parsed.data;

  // Honeypot: real visitors never fill the hidden "website" field. Pretend success.
  if (input.website) return { ok: true as const };

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown';
  if (submissions.isBlocked(ip)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many messages in a short time. Please try again a little later.' });
  }
  submissions.record(ip);

  const config = useRuntimeConfig(event);
  if (config.turnstileSecretKey) {
    const valid = await verifyTurnstileToken(input.turnstileToken, { secret: config.turnstileSecretKey, remoteIp: ip });
    if (!valid) {
      throw createError({ statusCode: 400, statusMessage: 'Please complete the security check.' });
    }
  }
  else if (!import.meta.dev) {
    // Production must never accept the form without the spam check.
    throw createError({ statusCode: 503, statusMessage: 'The contact form is not available right now. Please email instead.' });
  }

  const notifyTo = config.contactNotifyTo;
  await createInquiry(useDatabase(), input, {
    notify: async (inquiry) => {
      if (!notifyTo) throw new Error('NUXT_CONTACT_NOTIFY_TO is not set.');
      await sendEmail(inquiryNotificationEmail(inquiry, notifyTo));
    },
  });

  // The enquiry is saved even if the email failed; Tilana sees it in the admin.
  return { ok: true as const };
});
