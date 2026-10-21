import { requireAdmin } from '@/server/auth/admin';
import { getDatabase } from '@/server/db';
import { handle, routeId, type IdContext } from '@/server/http';
import { activeSubscribers } from '@/server/services/newsletter-subscribers';

/** Who the campaign would go to right now, for the review before sending. */
export const GET = handle(async (_request: Request, context: IdContext) => {
  await requireAdmin();
  await routeId(context);
  const recipients = await activeSubscribers(getDatabase());
  return Response.json({ recipients: recipients.map((person) => person.email) });
});
