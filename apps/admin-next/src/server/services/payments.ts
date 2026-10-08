import 'server-only';
import type { Database, Order } from '@tilana/db';
import { logger } from '../logger';
import { afterResponse } from '../utils/after-response';
import { verifyPayment, type VerifiedPayment } from '../utils/paystack';
import { deliverOrder } from './order-delivery';
import { applyVerifiedPayment, type PaymentCheck } from './orders';

/**
 * Asks Paystack about an unpaid order and records the answer. If this call is
 * the one that marks it paid, the PDFs are emailed after the response.
 */
export async function checkPayment(
  db: Database,
  order: Order,
  verify: (reference: string) => Promise<VerifiedPayment> = verifyPayment,
): Promise<PaymentCheck> {
  if (order.status === 'paid') return 'paid';
  let payment: VerifiedPayment;
  try {
    payment = await verify(order.reference);
  } catch (error) {
    // Unknown is not failed: keep it pending and ask again later.
    logger.warn({ err: error, orderNumber: order.orderNumber }, 'Paystack verification unavailable');
    return order.status === 'pending' ? 'pending' : order.status;
  }
  const result = await applyVerifiedPayment(db, order, payment);
  if (result.justPaid) afterResponse(() => deliverOrder(db, order.id));
  return result.status;
}
