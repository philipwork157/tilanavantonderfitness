import { newsletterSubscriberViewSchema } from '@tilana/contracts/admin-newsletter';
import { listSubscribers, subscriberCounts } from '../services/newsletter-subscribers';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const view = newsletterSubscriberViewSchema.catch('subscribed').parse(getQuery(event).view);
  const db = useDatabase();
  const [subscribers, counts] = await Promise.all([listSubscribers(db, view), subscriberCounts(db)]);
  return { view, subscribers, counts };
});
