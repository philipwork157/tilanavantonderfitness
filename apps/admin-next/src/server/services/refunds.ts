import 'server-only';
import { orders, type Database, type Order } from '@tilana/db';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { serverConfig } from '../config';
import { HttpError } from '../http';
import { logger } from '../logger';
import { afterResponse } from '../utils/after-response';
import { sendEmail } from '../utils/email';
import type { OutgoingEmail } from '../utils/email-routing';
import { createRefund, type PaystackRefund } from '../utils/paystack';
import { alertOrder } from './order-delivery';
import { orderItemsFor } from './orders';
import { refundEmail } from './sale-emails';

/*
 * Refunds (whole orders only). Tilana asks from the Sales page; Paystack
 * answers "pending" and confirms later (refund.processed webhook, or the
 * background order checks asking Paystack). Only then is the order refunded
 * and the buyer told. A refund made in the Paystack dashboard is picked up
 * from its webhook the same way.
 */

export interface RefundDependencies {
  create: (input: { transactionId: string; reason: string }) => Promise<PaystackRefund>;
  send: (email: OutgoingEmail) => Promise<unknown>;
}

const defaults: RefundDependencies = { create: createRefund, send: sendEmail };

/** Starts a refund for a paid order. */
export async function requestRefund(db: Database, orderNumber: string, reason: string, deps: RefundDependencies = defaults): Promise<Order> {
  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber));
  if (!order) throw new HttpError(404, 'Order not found.');
  if (order.status !== 'paid' || !order.paystackTransactionId) throw new HttpError(409, 'Only paid orders can be refunded.');

  // Claim it, so two clicks never ask Paystack twice.
  const claimed = await db.update(orders)
    .set({ refundStatus: 'pending', refundReason: reason, refundRequestedAt: new Date(), paystackRefundId: null })
    .where(and(eq(orders.id, order.id), eq(orders.status, 'paid'), or(isNull(orders.refundStatus), eq(orders.refundStatus, 'failed'))))
    .returning({ id: orders.id });
  if (!claimed.length) throw new HttpError(409, 'A refund for this order is already in progress.');

  let refund: PaystackRefund;
  try {
    refund = await deps.create({ transactionId: order.paystackTransactionId, reason });
  } catch (error) {
    logger.error({ err: error, orderNumber }, 'Paystack refund could not be started');
    const message = error instanceof Error ? error.message : 'Paystack did not accept the refund.';
    await db.update(orders).set({
      refundStatus: 'failed',
      reviewNote: `The refund could not be started: ${message.slice(0, 300)} Check the payment in Paystack before trying again.`,
    }).where(eq(orders.id, order.id));
    throw new HttpError(502, 'Paystack did not accept the refund. Check the payment in Paystack before trying again.');
  }

  await db.update(orders).set({ paystackRefundId: refund.id || null }).where(eq(orders.id, order.id));
  logger.info({ orderNumber, refundStatus: refund.status }, 'Refund requested');
  if (refund.status === 'processed') await completeRefund(db, order.id, deps);
  return (await db.select().from(orders).where(eq(orders.id, order.id)))[0]!;
}

/**
 * Paystack confirmed the money went back: the order becomes refunded (it no
 * longer counts as a sale) and the buyer gets an email. Safe to call twice.
 */
export async function completeRefund(db: Database, orderId: number, deps: Pick<RefundDependencies, 'send'> = defaults, reason?: string): Promise<boolean> {
  const updated = await db.update(orders).set({
    status: 'refunded',
    refundStatus: 'processed',
    refundedAt: new Date(),
    ...(reason ? { refundReason: reason } : {}),
  }).where(and(eq(orders.id, orderId), inArray(orders.status, ['paid']))).returning();
  const order = updated[0];
  if (!order) return false;
  logger.info({ orderNumber: order.orderNumber }, 'Order refunded');
  afterResponse(async () => {
    const items = await orderItemsFor(db, order.id);
    try {
      await deps.send(refundEmail(order.email, {
        firstName: order.firstName,
        orderNumber: order.orderNumber,
        programs: items.map(item => item.label),
        totalCents: order.totalCents,
        replyTo: serverConfig().contactNotifyTo || undefined,
      }));
    } catch (error) {
      logger.error({ err: error, orderNumber: order.orderNumber }, 'Refund email could not be sent');
    }
  });
  return true;
}

/** Paystack could not refund: keep the order paid and ask Tilana to look. */
export async function failRefund(db: Database, order: Order, message: string): Promise<void> {
  const updated = await db.update(orders)
    .set({ refundStatus: 'failed', reviewNote: `The refund failed: ${message.slice(0, 300)} Check it in Paystack.` })
    .where(and(eq(orders.id, order.id), eq(orders.refundStatus, 'pending'))).returning({ id: orders.id });
  if (!updated.length) return;
  logger.warn({ orderNumber: order.orderNumber }, 'Refund failed');
  afterResponse(() => alertOrder(order, 'A refund failed', [
    `Paystack could not refund this order: ${message}`,
    'The order still counts as paid. Please check it in Paystack.',
  ]));
}
