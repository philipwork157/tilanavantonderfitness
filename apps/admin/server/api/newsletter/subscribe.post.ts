import { newsletterSubscribeRequestSchema } from '@tilana/contracts/newsletter';
import { createAttemptLimiter } from '../../utils/admin-access';
import { startSubscription } from '../../services/newsletter-subscribers';
import { confirmationEmail } from '../../services/newsletter-emails';

const attempts = createAttemptLimiter({ maxAttempts: 5, windowMs: 10 * 60 * 1000 });

/**
 * Website newsletter form (double opt-in). The answer is the same whether or
 * not the address is already subscribed, so the form can't reveal who is.
 */
export default defineEventHandler(async (event) => {
  const parsed = newsletterSubscribeRequestSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Please check your email address and tick the box.' });
  }
  const input = parsed.data;
  if (input.website) return { ok: true as const };

  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown';
  if (attempts.isBlocked(ip)) {
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts. Please try again a little later.' });
  }
  attempts.record(ip);

  const config = useRuntimeConfig(event);
  if (config.turnstileSecretKey) {
    if (!(await verifyTurnstileToken(input.turnstileToken, { secret: config.turnstileSecretKey, remoteIp: ip }))) {
      throw createError({ statusCode: 400, statusMessage: 'Please complete the security check.' });
    }
  }
  else if (!import.meta.dev) {
    throw createError({ statusCode: 503, statusMessage: 'Newsletter sign-up is not available right now.' });
  }

  const result = await startSubscription(useDatabase(), { email: input.email, source: input.source });
  if (result.action === 'send-confirmation') {
    try {
      await sendEmail(confirmationEmail(result.email, confirmUrl(result.token), websiteUrl()));
    }
    catch (error) {
      console.error('Newsletter confirmation email failed', error);
      throw createError({ statusCode: 502, statusMessage: 'We could not send the confirmation email. Please try again shortly.' });
    }
  }
  return { ok: true as const };
});
