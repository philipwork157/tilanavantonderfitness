import 'server-only';
import { orders, type Database, type Order } from '@tilana/db';
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or } from 'drizzle-orm';
import { logger } from '../logger';
import { fetchRefund, PaystackError, verifyPayment, type PaystackRefund, type VerifiedPayment } from '../utils/paystack';
import { alertOrder, deliverOrder, type DeliveryDependencies } from './order-delivery';
import { applyVerifiedPayment } from './orders';
import { completeRefund, failRefund } from './refunds';

/*
 * Background order checks, every few minutes (see startOrderChecks and
 * /api/cron/order-checks). They catch what the buyer's browser and Paystack's
 * webhook can miss:
 *
 * 1. Unpaid orders are asked about at Paystack again. A payment made but never
 *    confirmed (tab closed, webhook lost) becomes paid and the PDFs go out.
 *    An order is only called abandoned or failed after Paystack says so and
 *    it is over an hour old; one Paystack has never heard of after a day.
 * 2. Paid orders whose PDFs did not go out (email error, server restart) are
 *    tried again a few times; after the last try Tilana is told.
 * 3. Refunds still pending at Paystack are checked until they finish.
 * 4. Paid orders without Paystack's fee (paid before fees were recorded) get it filled in.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Give the buyer time on Paystack's page before checking at all. */
const FIRST_CHECK_AFTER = 3 * MINUTE;
/** Before this age a "not completed" answer may just mean the buyer is still paying. */
const SETTLE_AFTER = HOUR;
/** Paystack has never heard of the payment: the page was never used. */
const UNKNOWN_AFTER = 24 * HOUR;
/** Stop asking after this; the order stays as it is (pending ones become abandoned first). */
const STOP_AFTER = 7 * 24 * HOUR;
/** Wait between checks of the same order: grows with each check, at most an hour. */
const checkGap = (checks: number) => Math.min(5 * MINUTE * 2 ** Math.min(checks, 4), HOUR);

/** PDF email attempts: when each try may start, counted from the payment. */
export const DELIVERY_SCHEDULE = [10 * MINUTE, 30 * MINUTE, 2 * HOUR, 12 * HOUR];
const REFUND_CHECK_GAP = 15 * MINUTE;
/** Unpaid checks count too; past this we stop asking for a missing fee. */
const MAX_FEE_CHECKS = 30;
const BATCH = 25;

export interface OrderCheckDependencies {
  verify: (reference: string) => Promise<VerifiedPayment>;
  refund: (id: string) => Promise<PaystackRefund>;
  delivery?: DeliveryDependencies;
}

const defaults: OrderCheckDependencies = { verify: verifyPayment, refund: fetchRefund };

export interface OrderCheckResult { checked: number; paid: number; closed: number; deliveries: number; refunds: number; fees: number }

export async function runOrderChecks(db: Database, now = new Date(), deps: OrderCheckDependencies = defaults): Promise<OrderCheckResult> {
  const result: OrderCheckResult = { checked: 0, paid: 0, closed: 0, deliveries: 0, refunds: 0, fees: 0 };
  await checkUnpaidOrders(db, now, deps, result);
  await retryDeliveries(db, now, deps, result);
  await checkRefunds(db, now, deps, result);
  await fillMissingFees(db, now, deps, result);
  return result;
}

async function checkUnpaidOrders(db: Database, now: Date, deps: OrderCheckDependencies, result: OrderCheckResult) {
  const candidates = await db.select().from(orders).where(and(
    eq(orders.status, 'pending'),
    lte(orders.createdAt, new Date(now.getTime() - FIRST_CHECK_AFTER)),
    gte(orders.createdAt, new Date(now.getTime() - STOP_AFTER)),
  )).orderBy(asc(orders.lastCheckedAt), asc(orders.createdAt)).limit(BATCH * 4);
  const due = candidates.filter(order => !order.lastCheckedAt || now.getTime() - order.lastCheckedAt.getTime() >= checkGap(order.checkCount)).slice(0, BATCH);

  for (const order of due) {
    result.checked += 1;
    const age = now.getTime() - order.createdAt.getTime();
    await db.update(orders).set({ checkCount: order.checkCount + 1, lastCheckedAt: now }).where(eq(orders.id, order.id));
    let payment: VerifiedPayment;
    try {
      payment = await deps.verify(order.reference);
    } catch (error) {
      if (error instanceof PaystackError && error.notFound && age >= UNKNOWN_AFTER) {
        if (await close(db, order, 'abandoned')) result.closed += 1;
      } else {
        logger.warn({ err: error, orderNumber: order.orderNumber }, 'Order check: Paystack unavailable');
      }
      continue;
    }

    if (payment.status === 'success') {
      const applied = await applyVerifiedPayment(db, order, payment, 'order check');
      if (applied.justPaid) {
        result.paid += 1;
        logger.warn({ orderNumber: order.orderNumber }, 'Order check found a payment the website never confirmed');
        await deliverOrder(db, order.id, deps.delivery);
      }
      if (applied.flagged) {
        await alertOrder(order, 'A payment does not match its order', [
          'Paystack reports a successful payment for this order, but the amount, currency or test/live mode does not match. The order was not marked paid and no PDFs were sent.',
          'Please check the payment in Paystack, then refund it or contact the buyer.',
        ], deps.delivery);
      }
    } else if ((payment.status === 'abandoned' || payment.status === 'failed') && age >= SETTLE_AFTER) {
      if (await close(db, order, payment.status)) result.closed += 1;
    }
    // Anything else (ongoing, processing, queued, a young "abandoned"): ask again later.
  }

  // Past the last check and still unpaid: nobody is paying for these any more.
  await db.update(orders).set({ status: 'abandoned' })
    .where(and(eq(orders.status, 'pending'), lt(orders.createdAt, new Date(now.getTime() - STOP_AFTER)), isNull(orders.reviewNote)));
}

/** Closes an unpaid order. A late success from Paystack can still turn it into paid. */
async function close(db: Database, order: Order, status: 'abandoned' | 'failed') {
  const updated = await db.update(orders).set({ status })
    .where(and(eq(orders.id, order.id), eq(orders.status, 'pending'))).returning({ id: orders.id });
  if (updated.length) logger.info({ orderNumber: order.orderNumber, status }, 'Unpaid order closed');
  return updated.length > 0;
}

async function retryDeliveries(db: Database, now: Date, deps: OrderCheckDependencies, result: OrderCheckResult) {
  const waiting = await db.select().from(orders).where(and(
    eq(orders.status, 'paid'),
    ne(orders.deliveryStatus, 'sent'),
    lt(orders.deliveryAttempts, DELIVERY_SCHEDULE.length),
    isNotNull(orders.paidAt),
  )).orderBy(asc(orders.paidAt)).limit(BATCH * 4);

  for (const order of waiting) {
    const startAt = order.paidAt!.getTime() + DELIVERY_SCHEDULE[order.deliveryAttempts]!;
    if (now.getTime() < startAt) continue;
    result.deliveries += 1;
    await deliverOrder(db, order.id, deps.delivery);
    const [after] = await db.select().from(orders).where(eq(orders.id, order.id));
    if (after && after.deliveryStatus !== 'sent' && after.deliveryAttempts >= DELIVERY_SCHEDULE.length) {
      await alertOrder(after, 'The PDFs could not be emailed', [
        `We tried ${after.deliveryAttempts} times to email the PDFs for this order and it did not work: ${after.deliveryError ?? 'unknown error'}.`,
        `Fix the problem (for example a missing PDF), then use "Email PDFs again" on the Sales page. The buyer is ${after.email}.`,
      ], deps.delivery);
    }
  }
}

async function checkRefunds(db: Database, now: Date, deps: OrderCheckDependencies, result: OrderCheckResult) {
  const pending = await db.select().from(orders).where(and(
    eq(orders.status, 'paid'),
    eq(orders.refundStatus, 'pending'),
    isNotNull(orders.paystackRefundId),
    or(isNull(orders.lastCheckedAt), lte(orders.lastCheckedAt, new Date(now.getTime() - REFUND_CHECK_GAP))),
  )).limit(BATCH);

  for (const order of pending) {
    result.refunds += 1;
    await db.update(orders).set({ lastCheckedAt: now }).where(eq(orders.id, order.id));
    try {
      const refund = await deps.refund(order.paystackRefundId!);
      if (refund.status === 'processed') await completeRefund(db, order.id, deps.delivery);
      else if (refund.status === 'failed') await failRefund(db, order, 'Paystack marked the refund as failed.');
    } catch (error) {
      logger.warn({ err: error, orderNumber: order.orderNumber }, 'Refund check: Paystack unavailable');
    }
  }
}

/** Asks Paystack for the fee of paid orders that do not have it yet (a few tries, an hour apart). */
async function fillMissingFees(db: Database, now: Date, deps: OrderCheckDependencies, result: OrderCheckResult) {
  const missing = await db.select().from(orders).where(and(
    inArray(orders.status, ['paid', 'refunded']),
    isNull(orders.feeCents),
    lt(orders.checkCount, MAX_FEE_CHECKS),
    or(isNull(orders.lastCheckedAt), lte(orders.lastCheckedAt, new Date(now.getTime() - HOUR))),
  )).limit(BATCH);

  for (const order of missing) {
    await db.update(orders).set({ checkCount: order.checkCount + 1, lastCheckedAt: now }).where(eq(orders.id, order.id));
    try {
      const payment = await deps.verify(order.reference);
      if (payment.feeCents !== null) {
        await db.update(orders).set({ feeCents: payment.feeCents }).where(and(eq(orders.id, order.id), isNull(orders.feeCents)));
        result.fees += 1;
      }
    } catch (error) {
      logger.warn({ err: error, orderNumber: order.orderNumber }, 'Fee check: Paystack unavailable');
    }
  }
}

/* ── Running it ── */

let running = false;

/** One run at a time per server; overlapping runs simply skip. */
export async function runOrderChecksOnce(db: Database): Promise<OrderCheckResult | null> {
  if (running) return null;
  running = true;
  try {
    const result = await runOrderChecks(db);
    if (result.checked || result.deliveries || result.refunds || result.fees) logger.info({ ...result }, 'Order checks done');
    return result;
  } catch (error) {
    logger.error({ err: error }, 'Order checks failed');
    return null;
  } finally {
    running = false;
  }
}

