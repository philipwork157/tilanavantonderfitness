import { newsletterTokenRequestSchema } from '@tilana/contracts/newsletter';
import { createAttemptLimiter } from '@/server/auth/admin-access';
import { websitePreflight, websiteRoute } from '@/server/cors';
import { getDatabase } from '@/server/db';
import { clientIp, HttpError, readJson } from '@/server/http';
import { unsubscribe } from '@/server/services/newsletter-subscribers';

const attempts = createAttemptLimiter({ maxAttempts: 20, windowMs: 10 * 60 * 1000 });

/** Called by the website unsubscribe page (link in every newsletter). */
export const POST = websiteRoute(async (request) => {
  const ip = clientIp(request);
  if (attempts.isBlocked(ip)) throw new HttpError(429, 'Too many attempts.');
  attempts.record(ip);

  const parsed = newsletterTokenRequestSchema.safeParse(await readJson(request));
  if (!parsed.success || !(await unsubscribe(getDatabase(), parsed.data.token))) {
    throw new HttpError(400, 'This unsubscribe link is not valid.');
  }
  return Response.json({ ok: true });
});

export const OPTIONS = websitePreflight;
