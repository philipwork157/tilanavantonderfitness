import { newsletterSubscriberViewSchema } from '@tilana/contracts/admin-newsletter';
import { requireAdmin } from '@/server/auth/admin';
import { getDatabase } from '@/server/db';
import { handle } from '@/server/http';
import { listSubscribers, subscriberCounts } from '@/server/services/newsletter-subscribers';

export const GET = handle(async (request: Request) => {
  await requireAdmin();
  const view = newsletterSubscriberViewSchema.catch('subscribed').parse(new URL(request.url).searchParams.get('view') ?? undefined);
  const db = getDatabase();
  const [subscribers, counts] = await Promise.all([listSubscribers(db, view), subscriberCounts(db)]);
  return Response.json({ view, subscribers, counts });
});
