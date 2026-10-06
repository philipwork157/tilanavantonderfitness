import { activeSubscribers } from '../../../services/newsletter-subscribers';

/** Who the campaign would go to right now, for the review before sending. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  routeId(event);
  const recipients = await activeSubscribers(useDatabase());
  return { recipients: recipients.map(person => person.email) };
});
