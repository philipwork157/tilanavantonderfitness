import { requireAdmin } from '@/server/auth/admin';
import { getDatabase } from '@/server/db';
import { handle } from '@/server/http';
import { postHogSettings } from '@/server/services/posthog';
import { siteFrom } from '@/server/services/website-request';
import { liveStats } from '@/server/services/website-stats';

/** Who is on the website right now (last 5 minutes) and the latest actions. This admin's site only. */
export const GET = handle(async () => {
  await requireAdmin();
  const settings = postHogSettings();
  if (!settings) return Response.json({ configured: false });
  return Response.json(await liveStats(getDatabase(), settings, siteFrom()));
});
