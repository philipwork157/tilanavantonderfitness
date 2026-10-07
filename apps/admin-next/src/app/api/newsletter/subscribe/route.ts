import { newsletterSubscribeRequestSchema } from '@tilana/contracts/newsletter';
import { createAttemptLimiter } from '@/server/auth/admin-access';
import { isDevelopment, serverConfig } from '@/server/config';
import { websitePreflight, websiteRoute } from '@/server/cors';
import { getDatabase } from '@/server/db';
import { clientIp, HttpError, readJson } from '@/server/http';
import { confirmationEmail } from '@/server/services/newsletter-emails';
import { startSubscription } from '@/server/services/newsletter-subscribers';
import { sendEmail } from '@/server/utils/email';
import { confirmUrl, websiteUrl } from '@/server/utils/newsletter';
import { verifyTurnstileToken } from '@/server/utils/turnstile';

const attempts = createAttemptLimiter({ maxAttempts: 5, windowMs: 10 * 60 * 1000 });

/**
 * Website newsletter form (double opt-in). The answer is the same whether or
 * not the address is already subscribed, so the form can't reveal who is.
 */
export const POST = websiteRoute(async (request) => {
  const parsed = newsletterSubscribeRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'Please check your email address and tick the box.');
  const input = parsed.data;
  if (input.website) return Response.json({ ok: true });

  const ip = clientIp(request);
  if (attempts.isBlocked(ip)) throw new HttpError(429, 'Too many attempts. Please try again a little later.');
  attempts.record(ip);

  const config = serverConfig();
  if (config.turnstileSecretKey) {
    if (!(await verifyTurnstileToken(input.turnstileToken, { secret: config.turnstileSecretKey, remoteIp: ip }))) {
      throw new HttpError(400, 'Please complete the security check.');
    }
  } else if (!isDevelopment) {
    throw new HttpError(503, 'Newsletter sign-up is not available right now.');
  }

  const result = await startSubscription(getDatabase(), { email: input.email, source: input.source });
  if (result.action === 'send-confirmation') {
    try {
      await sendEmail(confirmationEmail(result.email, confirmUrl(result.token), websiteUrl()));
    } catch (error) {
      console.error('Newsletter confirmation email failed', error);
      throw new HttpError(502, 'We could not send the confirmation email. Please try again shortly.');
    }
  }
  return Response.json({ ok: true });
});

export const OPTIONS = websitePreflight;
