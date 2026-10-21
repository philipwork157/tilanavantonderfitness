import { requireAdmin } from '@/server/auth/admin';
import { getDatabase } from '@/server/db';
import { handle, routeId, type IdContext } from '@/server/http';
import { activeSubscribers } from '@/server/services/newsletter-subscribers';
import { newsletterOnlyTo } from '@/server/utils/newsletter';

/** Who the campaign would go to right now, for the review before sending (only the developer on development). */
export const GET = handle(async (_request: Request, context: IdContext) => {
  await requireAdmin();
  await routeId(context);
  const recipients = await activeSubscribers(getDatabase(), { onlyEmail: newsletterOnlyTo() });
  return Response.json({ recipients: recipients.map((person) => person.email) });
});
