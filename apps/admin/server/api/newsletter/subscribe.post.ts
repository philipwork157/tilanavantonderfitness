import { newsletterSubscribeRequestSchema, newsletterValidationMessages, type NewsletterFormField } from '@tilana/contracts/newsletter';
import { applyContactCors, enforceContactRateLimit, getContactRequestIp, verifyContactTurnstile } from '../../utils/contact-security';
import { startNewsletterSubscription } from '../../services/newsletter-subscriptions';
import { sendNewsletterConfirmation } from '../../services/newsletter-emails';

export default defineEventHandler(async (event) => {
  applyContactCors(event);
  const contentLength = Number(getHeader(event, 'content-length') || 0);
  if (contentLength > 5_000) throw createError({ statusCode: 413, statusMessage: 'Request too large.' });
  const parsed = newsletterSubscribeRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    const field = String(parsed.error.issues[0]?.path[0] ?? '') as NewsletterFormField;
    throw createError({ statusCode: 400, statusMessage: newsletterValidationMessages[field] ?? 'Please check the form.' });
  }
  if (parsed.data.website) {
    setResponseStatus(event, 201);
    return { ok: true };
  }

  const ip = getContactRequestIp(event);
  await enforceContactRateLimit(ip, 'newsletter');
  await verifyContactTurnstile(parsed.data.turnstileToken, ip, 'newsletter');

  try {
    const subscription = await startNewsletterSubscription(parsed.data);
    if (subscription.confirmationToken) {
      await sendNewsletterConfirmation(parsed.data.email.trim().toLowerCase(), subscription.confirmationToken);
    }
  } catch (error) {
    console.error('Failed to start newsletter subscription.', error instanceof Error ? error.message : 'Unknown error.');
    throw createError({ statusCode: 503, statusMessage: 'The subscription could not be started. Please try again shortly.' });
  }

  setResponseStatus(event, 201);
  return { ok: true };
});
