import { orderNumberSchema, resendOrderRequestSchema } from '@tilana/contracts/admin-orders';
import { createAttemptLimiter, isSameOrigin } from '@/server/auth/admin-access';
import { requireAdmin } from '@/server/auth/admin';
import { getDatabase } from '@/server/db';
import { handle, HttpError, readJson, sameOriginOnly } from '@/server/http';
import { resendOrder } from '@/server/services/order-delivery';

// Per order: enough to fix a typo and try again, not enough to flood an inbox.
const attempts = createAttemptLimiter({ maxAttempts: 5, windowMs: 60 * 60 * 1000 });

/** Emails a paid order's PDFs again, to the buyer or to an address the admin types in. */
export const POST = handle(async (request: Request, context: { params: Promise<{ orderNumber: string }> }) => {
  sameOriginOnly(request, isSameOrigin);
  await requireAdmin();
  const number = orderNumberSchema.safeParse((await context.params).orderNumber);
  if (!number.success) throw new HttpError(404, 'Order not found.');
  const orderNumber = number.data;
  const body = resendOrderRequestSchema.safeParse(await readJson(request) ?? {});
  if (!body.success) throw new HttpError(400, 'Please enter a valid email address.');

  if (attempts.isBlocked(orderNumber)) throw new HttpError(429, 'These PDFs were sent several times in the last hour. Please wait a little before trying again.');
  attempts.record(orderNumber);

  const result = await resendOrder(getDatabase(), orderNumber, { to: body.data.email || undefined });
  if (!result) throw new HttpError(404, 'Only paid orders can be sent again.');
  if (!result.delivered) throw new HttpError(502, `The email could not be sent: ${result.failure ?? 'unknown error'}`);
  return Response.json({ sentTo: result.sentTo });
});
