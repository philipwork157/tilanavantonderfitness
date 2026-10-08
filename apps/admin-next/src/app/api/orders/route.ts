import { requireAdmin } from '@/server/auth/admin';
import { getDatabase } from '@/server/db';
import { handle } from '@/server/http';
import { findOrders } from '@/server/services/sales';

/** Order search for the Sales page: ?q= order number, email or name (any date). */
export const GET = handle(async (request: Request) => {
  await requireAdmin();
  const query = new URL(request.url).searchParams.get('q') ?? '';
  return Response.json({ orders: await findOrders(getDatabase(), query) });
});
