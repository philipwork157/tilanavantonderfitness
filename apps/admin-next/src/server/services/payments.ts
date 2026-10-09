import 'server-only';
import type { Database, Order } from '@tilana/db';
import { logger } from '../logger';
import { afterResponse } from '../utils/after-response';
import { verifyPayment, type VerifiedPayment } from '../utils/paystack';
import { alertOrder, deliverOrder } from './order-delivery';
import { applyVerifiedPayment, type PaymentCheck, type PaymentSource } from './orders';

/**
 * Asks Paystack about an unpaid order and records the answer. If this call is
 * the one that marks it paid, the PDFs are emailed after the response.
 */
export async function checkPayment(
  db: Database,
  order: Order,
  source: PaymentSource,
  verify: (reference: string) => Promise<VerifiedPayment> = verifyPayment,
): Promise<PaymentCheck> {
  if (order.status === 'paid' || order.status === 'refunded') return order.status;
  let payment: VerifiedPayment;
  try {
    payment = await verify(order.reference);
  } catch (error) {
    // Unknown is not failed: keep it pending and ask again later.
    logger.warn({ err: error, orderNumber: order.orderNumber }, 'Paystack verification unavailable');
    return order.status === 'pending' ? 'pending' : order.status;
  }
  const result = await applyVerifiedPayment(db, order, payment, source);
  if (result.justPaid) afterResponse(() => deliverOrder(db, order.id));
  if (result.flagged) {
    afterResponse(() => alertOrder(order, 'A payment does not match its order', [
      'Paystack reports a successful payment for this order, but the amount, currency or test/live mode does not match. The order was not marked paid and no PDFs were sent.',
      'Please check the payment in Paystack, then refund it or contact the buyer.',
    ]));
  }
  return result.status;
}
