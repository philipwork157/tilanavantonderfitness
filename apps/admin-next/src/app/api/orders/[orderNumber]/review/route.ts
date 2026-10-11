import { orderNumberSchema } from '@tilana/contracts/admin-orders';
import { orders } from '@tilana/db';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, sameOriginOnly } from '@/server/http';
import { logger } from '@/server/logger';

/**
 * "Mark as checked": clears an order's "Needs review" note once a person has
 * dealt with it (in Paystack). A mismatched payment is then not flagged, checked
 * or emailed about again; a new problem (such as a dispute) still is.
 */
export const POST = handle(async (request: Request, context: { params: Promise<{ orderNumber: string }> }) => {
  sameOriginOnly(request, isSameOrigin);
  const admin = await requireAdmin();
  const number = orderNumberSchema.safeParse((await context.params).orderNumber);
  if (!number.success) throw new HttpError(404, 'Order not found.');
  const updated = await getDatabase().update(orders).set({ reviewNote: null, reviewedAt: new Date() })
    .where(eq(orders.orderNumber, number.data)).returning({ id: orders.id });
  if (!updated.length) throw new HttpError(404, 'Order not found.');
  logger.info({ orderNumber: number.data, adminId: admin.id }, 'Order review note cleared');
  return Response.json({ ok: true });
});
