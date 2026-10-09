import { orders } from '@tilana/db';
import { and, eq, isNull } from 'drizzle-orm';
import { getDatabase } from '@/server/db';
import { handle, HttpError } from '@/server/http';
import { logger } from '@/server/logger';
import { alertOrder } from '@/server/services/order-delivery';
import { findOrderBy } from '@/server/services/orders';
import { checkPayment } from '@/server/services/payments';
import { completeRefund, failRefund } from '@/server/services/refunds';
import { isValidPaystackSignature, paystackSettings } from '@/server/utils/paystack';

interface PaystackEvent {
  event?: string;
  data?: {
    reference?: unknown;
    transaction_reference?: unknown;
    transaction?: { reference?: unknown };
    status?: unknown;
  };
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * Paystack calls this for payments, refunds and disputes (set the URL in
 * Paystack > Settings > API Keys & Webhooks, for test and for live). The
 * signature proves it came from Paystack; a payment is still verified with
 * Paystack before it counts. Always answers 200 for genuine events so
 * Paystack stops retrying.
 */
export const POST = handle(async (request: Request) => {
  const { secretKey } = paystackSettings();
  const raw = await request.text();
  if (!isValidPaystackSignature(raw, request.headers.get('x-paystack-signature'), secretKey)) {
    throw new HttpError(401, 'Invalid signature.');
  }
  const { event = '', data = {} } = JSON.parse(raw) as PaystackEvent;
  const reference = text(data.reference) || text(data.transaction_reference) || text(data.transaction?.reference);
  logger.info({ event, hasReference: Boolean(reference) }, 'Paystack webhook received');
  if (!reference) return Response.json({ ok: true });

  const db = getDatabase();
  const order = await findOrderBy(db, 'reference', reference);
  if (!order) {
    logger.warn({ event }, 'Paystack webhook for an unknown reference');
    return Response.json({ ok: true });
  }

  if (event === 'charge.success') {
    const status = await checkPayment(db, order, 'webhook');
    logger.info({ orderNumber: order.orderNumber, status }, 'Paystack payment webhook handled');
  } else if (event === 'refund.processed') {
    // Also covers refunds made in the Paystack dashboard.
    const done = await completeRefund(db, order.id, undefined, order.refundReason ? undefined : 'Refunded in Paystack');
    logger.info({ orderNumber: order.orderNumber, done }, 'Paystack refund webhook handled');
  } else if (event === 'refund.failed') {
    await failRefund(db, order, 'Paystack marked the refund as failed.');
  } else if (event === 'charge.dispute.create') {
    const note = 'The buyer opened a dispute (chargeback) with their bank. Respond to it in Paystack.';
    const flagged = await db.update(orders).set({ reviewNote: note })
      .where(and(eq(orders.id, order.id), isNull(orders.reviewNote))).returning({ id: orders.id });
    logger.warn({ orderNumber: order.orderNumber }, 'Paystack dispute opened');
    if (flagged.length) {
      await alertOrder(order, 'A buyer opened a dispute', [
        'The buyer asked their bank to reverse this payment (a chargeback). Paystack needs your response before its deadline, usually with proof that the PDFs were delivered.',
        'Open the dispute in your Paystack dashboard and respond there.',
      ]);
    }
  }
  return Response.json({ ok: true });
});
