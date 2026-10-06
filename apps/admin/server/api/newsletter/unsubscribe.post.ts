import { newsletterTokenRequestSchema } from '@tilana/contracts/newsletter';
import { createAttemptLimiter } from '../../utils/admin-access';
import { unsubscribe } from '../../services/newsletter-subscribers';

const attempts = createAttemptLimiter({ maxAttempts: 20, windowMs: 10 * 60 * 1000 });

/** Called by the website unsubscribe page (link in every newsletter). */
export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown';
  if (attempts.isBlocked(ip)) throw createError({ statusCode: 429, statusMessage: 'Too many attempts.' });
  attempts.record(ip);

  const parsed = newsletterTokenRequestSchema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success || !(await unsubscribe(useDatabase(), parsed.data.token))) {
    throw createError({ statusCode: 400, statusMessage: 'This unsubscribe link is not valid.' });
  }
  return { ok: true as const };
});
