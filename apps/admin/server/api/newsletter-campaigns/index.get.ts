import { listCampaigns } from '../../services/newsletter-campaigns';
import { subscriberCounts } from '../../services/newsletter-subscribers';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const db = useDatabase();
  const [campaigns, counts] = await Promise.all([listCampaigns(db), subscriberCounts(db)]);
  return { campaigns, subscriberCount: counts.subscribed };
});
