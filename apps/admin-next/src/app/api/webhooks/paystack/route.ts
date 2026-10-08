import { getDatabase } from '@/server/db';
import { handle, HttpError } from '@/server/http';
import { logger } from '@/server/logger';
import { findOrderBy } from '@/server/services/orders';
import { checkPayment } from '@/server/services/payments';
import { isValidPaystackSignature, paystackSettings } from '@/server/utils/paystack';

/**
 * Paystack calls this when a payment succeeds (set the URL in Paystack >
 * Settings > API Keys & Webhooks). The signature proves it came from
 * Paystack; the payment is still verified with Paystack before it counts.
 * Always answers 200 for genuine events so Paystack stops retrying.
 */
export const POST = handle(async (request: Request) => {
  const { secretKey } = paystackSettings();
  const raw = await request.text();
  if (!isValidPaystackSignature(raw, request.headers.get('x-paystack-signature'), secretKey)) {
    throw new HttpError(401, 'Invalid signature.');
  }
  const event = JSON.parse(raw) as { event?: string; data?: { reference?: unknown } };
  const reference = typeof event.data?.reference === 'string' ? event.data.reference : '';
  if (event.event !== 'charge.success' || !reference) return Response.json({ ok: true });

  const db = getDatabase();
  const order = await findOrderBy(db, 'reference', reference);
  if (!order) {
    logger.warn({ event: event.event }, 'Paystack webhook for an unknown reference');
    return Response.json({ ok: true });
  }
  const status = await checkPayment(db, order);
  logger.info({ orderNumber: order.orderNumber, status }, 'Paystack webhook handled');
  return Response.json({ ok: true });
});
