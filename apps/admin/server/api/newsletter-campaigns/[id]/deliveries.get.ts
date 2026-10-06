import { listDeliveries } from '../../../services/newsletter-campaigns';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  return { deliveries: await listDeliveries(useDatabase(), routeId(event)) };
});
