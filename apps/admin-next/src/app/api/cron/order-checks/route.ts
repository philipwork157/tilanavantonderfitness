import { timingSafeEqual } from 'node:crypto';
import { serverConfig } from '@/server/config';
import { getDatabase } from '@/server/db';
import { handle, HttpError } from '@/server/http';
import { runOrderChecksOnce } from '@/server/services/order-checks';

/**
 * Runs the background order checks once, for hosts with scheduled jobs
 * (e.g. Vercel Cron every 5 minutes). Needs "Authorization: Bearer <CRON_SECRET>";
 * without CRON_SECRET this URL does not exist.
 */
export const GET = handle(async (request: Request) => {
  const secret = serverConfig().cronSecret;
  if (!secret) throw new HttpError(404, 'Not found.');
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new HttpError(401, 'Unauthorized.');
  const result = await runOrderChecksOnce(getDatabase());
  return Response.json({ ok: true, ...(result ?? { skipped: true }) });
});
