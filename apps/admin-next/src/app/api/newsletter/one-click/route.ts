import { newsletterTokenRequestSchema } from '@tilana/contracts/newsletter';
import { createAttemptLimiter } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { clientIp, handle, HttpError, readJson } from '@/server/http';
import { unsubscribe } from '@/server/services/newsletter-subscribers';

/*
 * One-click unsubscribe (RFC 8058), required by Gmail and Yahoo for bulk mail.
 * The mail app POSTs to the website's /newsletter/one-click, whose server
 * passes the token on to here. Unlike the website's unsubscribe page this
 * call comes from a server, not a browser, so there is no Origin to check;
 * the secret token in the newsletter is the only proof needed.
 */
const attempts = createAttemptLimiter({ maxAttempts: 600, windowMs: 10 * 60 * 1000 });

export const POST = handle(async (request: Request) => {
  const ip = clientIp(request);
  if (attempts.isBlocked(ip)) throw new HttpError(429, 'Too many attempts.');
  attempts.record(ip);

  const parsed = newsletterTokenRequestSchema.safeParse(await readJson(request));
  if (!parsed.success || !(await unsubscribe(getDatabase(), parsed.data.token))) {
    throw new HttpError(400, 'This unsubscribe link is not valid.');
  }
  return Response.json({ ok: true });
});
