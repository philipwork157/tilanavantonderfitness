import { requireAdmin } from '@/server/auth/admin';
import { getDatabase } from '@/server/db';
import { handle, routeId, type IdContext } from '@/server/http';
import { listDeliveries } from '@/server/services/newsletter-campaigns';

export const GET = handle(async (_request: Request, context: IdContext) => {
  await requireAdmin();
  return Response.json({ deliveries: await listDeliveries(getDatabase(), await routeId(context)) });
});
