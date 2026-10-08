import { requireAdmin } from '@/server/auth/admin';
import { getDatabase } from '@/server/db';
import { handle } from '@/server/http';
import { SALES_PERIODS, salesSummary } from '@/server/services/sales';

/** Paid sales for the Sales page: ?days=7|30|90|365 (default 30). */
export const GET = handle(async (request: Request) => {
  await requireAdmin();
  const asked = Number(new URL(request.url).searchParams.get('days'));
  const days = (SALES_PERIODS as readonly number[]).includes(asked) ? asked : 30;
  return Response.json(await salesSummary(getDatabase(), days));
});
