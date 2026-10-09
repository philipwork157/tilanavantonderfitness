import { createAttemptLimiter } from '@/server/auth/admin-access';
import { publicReadRoute } from '@/server/cors';
import { getDatabase } from '@/server/db';
import { clientIp, HttpError } from '@/server/http';
import { findOrderBy } from '@/server/services/orders';
import { checkPayment } from '@/server/services/payments';

const referencePattern = /^[A-Za-z0-9.=-]{10,160}$/;
// Each check may ask Paystack, so keep it to what the payment page needs.
const checks = createAttemptLimiter({ maxAttempts: 120, windowMs: 10 * 60 * 1000 });

const toPublicStatus = { paid: 'succeeded', pending: 'pending', failed: 'failed', abandoned: 'abandoned', refunded: 'refunded' } as const;
const toDeliveryStatus = { pending: 'pending', sent: 'sent', failed: 'unavailable' } as const;

/**
 * The payment page asks here after Paystack sends the buyer back. The answer
 * comes from Paystack's server, never from the redirect.
 */
export const GET = publicReadRoute(async (request: Request) => {
  const reference = new URL(request.url).searchParams.get('reference') ?? '';
  if (!referencePattern.test(reference)) throw new HttpError(400, 'Unknown payment reference.');
  const ip = clientIp(request);
  if (checks.isBlocked(ip)) throw new HttpError(429, 'Too many checks. Please wait a moment.');
  checks.record(ip);

  const db = getDatabase();
  const order = await findOrderBy(db, 'reference', reference);
  if (!order) throw new HttpError(404, 'Unknown payment reference.');
  const status = await checkPayment(db, order, 'payment page');
  const latest = status === 'paid' ? (await findOrderBy(db, 'reference', reference))! : order;
  return Response.json(
    {
      status: toPublicStatus[status],
      orderNumber: order.orderNumber,
      ...(status === 'paid' ? { deliveryStatus: toDeliveryStatus[latest.deliveryStatus] } : {}),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
});
