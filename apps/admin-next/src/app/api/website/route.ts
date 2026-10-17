import { requireAdmin } from '@/server/auth/admin';
import { getDatabase } from '@/server/db';
import { handle } from '@/server/http';
import { postHogSettings } from '@/server/services/posthog';
import { periodFrom, siteFrom } from '@/server/services/website-request';
import { websiteStats } from '@/server/services/website-stats';

/** Website analytics from PostHog for the Website page: ?days=7|30|90&site=live|testing. */
export const GET = handle(async (request: Request) => {
  await requireAdmin();
  const settings = postHogSettings();
  if (!settings) return Response.json({ configured: false });
  const url = new URL(request.url);
  return Response.json(await websiteStats(getDatabase(), settings, periodFrom(url), siteFrom(url)));
});
