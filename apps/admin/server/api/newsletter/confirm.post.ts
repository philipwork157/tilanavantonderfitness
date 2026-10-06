import { newsletterTokenRequestSchema } from '@tilana/contracts/newsletter';
import { createAttemptLimiter } from '../../utils/admin-access';
import { confirmSubscription } from '../../services/newsletter-subscribers';

const attempts = createAttemptLimiter({ maxAttempts: 20, windowMs: 10 * 60 * 1000 });

/** Called by the website page the confirmation email links to. */
export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown';
  if (attempts.isBlocked(ip)) throw createError({ statusCode: 429, statusMessage: 'Too many attempts.' });
  attempts.record(ip);

  const parsed = newsletterTokenRequestSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success || !(await confirmSubscription(useDatabase(), parsed.data.token))) {
    throw createError({ statusCode: 400, statusMessage: 'This confirmation link is no longer valid.' });
  }
  return { ok: true as const };
});
