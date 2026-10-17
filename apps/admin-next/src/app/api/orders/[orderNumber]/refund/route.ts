import { orderNumberSchema, refundOrderRequestSchema } from '@tilana/contracts/admin-orders';
import { requireRole } from '@/server/auth/admin';
import { isSameOrigin } from '@/server/auth/admin-access';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, sameOriginOnly } from '@/server/http';
import { requestRefund } from '@/server/services/refunds';

/** Refunds a whole paid order through Paystack. Money: admins only. */
export const POST = handle(async (request: Request, context: { params: Promise<{ orderNumber: string }> }) => {
  sameOriginOnly(request, isSameOrigin);
  await requireRole(['admin']);
  const number = orderNumberSchema.safeParse((await context.params).orderNumber);
  if (!number.success) throw new HttpError(404, 'Order not found.');
  const body = refundOrderRequestSchema.safeParse(await readJson(request));
  if (!body.success) throw new HttpError(400, body.error.issues[0]?.message ?? 'Please give a short reason.');
  const order = await requestRefund(getDatabase(), number.data, body.data.reason);
  return Response.json({ status: order.status, refundStatus: order.refundStatus });
});
