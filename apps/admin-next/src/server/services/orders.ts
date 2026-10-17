import 'server-only';
import { randomBytes, randomInt } from 'node:crypto';
import type { BasketCheckoutRequest } from '@tilana/contracts/checkout';
import { orderItems, orders, programs, volumes, type Database, type Order, type OrderItem } from '@tilana/db';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { HttpError } from '../http';
import { logger } from '../logger';
import { isOnWebsite, programLabel } from './programs';
import type { PaystackMode, StartPayment, VerifiedPayment } from '../utils/paystack';

/*
 * Orders: a pending order is saved before the buyer goes to Paystack, and it
 * only becomes paid after Paystack confirms the payment to the server
 * (status, amount, currency, mode). Whoever flips it to paid first (the
 * status check or the webhook) sends the PDFs; nobody else does.
 */

const ORDER_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** "TV-7K4Q9P": short enough to read over the phone, no 0/O or 1/I. */
export function newOrderNumber(): string {
  return `TV-${Array.from({ length: 6 }, () => ORDER_ALPHABET[randomInt(ORDER_ALPHABET.length)]).join('')}`;
}

/** The Paystack reference: unguessable, and matches the website's reference pattern. */
export const newReference = (orderNumber: string) => `${orderNumber}-${randomBytes(6).toString('hex')}`;

/** Thrown when the browser retries a checkout that already finished; the website then shows its status. */
export class CheckoutAlreadyStartedError extends HttpError {
  constructor(readonly reference: string) {
    super(409, 'This checkout has already been completed or stopped. Showing its status.');
  }
}

export interface CheckoutDependencies {
  mode: PaystackMode;
  initialize: (input: StartPayment) => Promise<{ authorizationUrl: string }>;
  websiteUrl: string;
}

/**
 * Starts (or resumes) a checkout: checks every program and price against the
 * database, saves the pending order, then asks Paystack for the payment page.
 */
export async function startCheckout(db: Database, input: BasketCheckoutRequest, deps: CheckoutDependencies) {
  const existing = await findOrderBy(db, 'idempotencyKey', input.idempotencyKey);
  if (existing) return resume(existing);

  const slugs = input.items.map(item => item.volumeSlug);
  const rows = await db.select({ program: programs, volume: volumes }).from(programs)
    .innerJoin(volumes, eq(volumes.id, programs.volumeId)).where(inArray(programs.slug, slugs));
  const items = input.items.map((item) => {
    const row = rows.find(candidate => candidate.program.slug === item.volumeSlug);
    if (!row || !isOnWebsite(row.program, row.volume)) {
      throw new HttpError(409, 'A program in your basket is no longer available. Please review your basket.');
    }
    if (row.program.priceCents !== item.expectedPriceCents) {
      throw new HttpError(409, 'A price in your basket has changed. Please review your basket before paying.');
    }
    return { programId: row.program.id, slug: row.program.slug, label: programLabel(row.program.name, row.volume), priceCents: row.program.priceCents };
  });
  const totalCents = items.reduce((sum, item) => sum + item.priceCents, 0);

  let order: Order;
  try {
    order = await db.transaction(async (tx) => {
      const orderNumber = await freeOrderNumber(tx as unknown as Database);
      const [created] = await tx.insert(orders).values({
        orderNumber,
        reference: newReference(orderNumber),
        idempotencyKey: input.idempotencyKey,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone.trim(),
        totalCents,
        paymentMode: deps.mode,
      }).returning();
      await tx.insert(orderItems).values(items.map(item => ({ ...item, orderId: created!.id })));
      return created!;
    });
  } catch (error) {
    // Two clicks at the same moment: the other request created it.
    const raced = await findOrderBy(db, 'idempotencyKey', input.idempotencyKey);
    if (raced) return resume(raced);
    throw error;
  }

  try {
    const { authorizationUrl } = await deps.initialize({
      email: order.email,
      amountCents: order.totalCents,
      reference: order.reference,
      callbackUrl: `${deps.websiteUrl}/checkout/complete?reference=${encodeURIComponent(order.reference)}`,
      cancelUrl: `${deps.websiteUrl}/checkout`,
      metadata: { order_number: order.orderNumber },
      details: [
        { label: 'Order number', value: order.orderNumber },
        { label: 'Programs', value: items.map(item => item.label).join(', ') },
        { label: 'Buyer', value: `${order.firstName} ${order.lastName}`.trim() },
      ],
    });
    await db.update(orders).set({ authorizationUrl }).where(eq(orders.id, order.id));
    logger.info({ orderNumber: order.orderNumber, programs: items.length, totalCents: order.totalCents, mode: order.paymentMode }, 'Checkout started');
    return { authorizationUrl, reference: order.reference };
  } catch (error) {
    // No money moved: remove the order so the buyer can simply try again.
    await db.delete(orders).where(eq(orders.id, order.id));
    logger.error({ err: error, orderNumber: order.orderNumber }, 'Paystack checkout could not be started');
    throw new HttpError(502, 'Payment could not be started. Please try again in a moment.');
  }
}

function resume(order: Order) {
  if (order.status === 'pending' && order.authorizationUrl) {
    return { authorizationUrl: order.authorizationUrl, reference: order.reference };
  }
  throw new CheckoutAlreadyStartedError(order.reference);
}

async function freeOrderNumber(db: Database): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = newOrderNumber();
    if (!(await findOrderBy(db, 'orderNumber', candidate))) return candidate;
  }
  throw new Error('Could not find a free order number.');
}

export async function findOrderBy(db: Database, field: 'reference' | 'idempotencyKey' | 'orderNumber', value: string): Promise<Order | undefined> {
  const [row] = await db.select().from(orders).where(eq(orders[field], value));
  return row;
}

export type PaymentCheck = 'paid' | 'failed' | 'abandoned' | 'pending' | 'refunded';

/** Who confirmed a payment, for the logs: the buyer's return page, Paystack's webhook or the background check. */
export type PaymentSource = 'payment page' | 'webhook' | 'order check';

/** Order states a Paystack answer may still change. Paid and refunded orders are settled. */
const OPEN_STATUSES = ['pending', 'failed', 'abandoned'] as const;

/**
 * Applies Paystack's verified answer to the order. Returns `justPaid: true`
 * only to the one caller that moved it to paid, who must then deliver, and
 * `flagged: true` to the one caller that marked it for review.
 */
export async function applyVerifiedPayment(db: Database, order: Order, payment: VerifiedPayment, source?: PaymentSource): Promise<{ status: PaymentCheck; justPaid: boolean; flagged?: boolean }> {
  if (order.status === 'paid' || order.status === 'refunded') return { status: order.status, justPaid: false };
  if (payment.status === 'success') {
    // We asked for the order total; the buyer may be charged more if they pay Paystack's fee.
    const matches = payment.reference === order.reference
      && payment.requestedAmountCents === order.totalCents
      && payment.amountCents >= order.totalCents
      && payment.currency === order.currency
      && payment.mode === order.paymentMode;
    if (!matches) {
      // A person already checked this payment in Paystack ("Mark as checked"): leave it alone.
      if (order.reviewedAt) return { status: order.status, justPaid: false };
      // Money may have moved, so never call it failed: keep it open and ask a person to look.
      logger.error({ orderNumber: order.orderNumber, paystack: { amountCents: payment.amountCents, currency: payment.currency, mode: payment.mode } }, 'Paystack payment does not match the order; flagged for review');
      const note = `Paystack reports a successful payment of ${payment.amountCents / 100} ${payment.currency} (${payment.mode}) that does not match this order (${order.totalCents / 100} ${order.currency}, ${order.paymentMode}). Check it in Paystack.`;
      const flagged = await db.update(orders).set({ reviewNote: note })
        .where(and(eq(orders.id, order.id), isNull(orders.reviewNote))).returning({ id: orders.id });
      return { status: 'pending', justPaid: false, flagged: flagged.length > 0 };
    }
    const updated = await db.update(orders).set({
      status: 'paid',
      paidAt: payment.paidAt ?? new Date(),
      paystackTransactionId: payment.transactionId,
      paymentChannel: payment.channel,
      feeCents: payment.feeCents,
    }).where(and(eq(orders.id, order.id), inArray(orders.status, [...OPEN_STATUSES]))).returning({ id: orders.id });
    if (updated.length) {
      logger.info({ orderNumber: order.orderNumber, source, totalCents: order.totalCents, feeCents: payment.feeCents, channel: payment.channel, mode: payment.mode }, 'Order paid');
    }
    return { status: 'paid', justPaid: updated.length > 0 };
  }
  if (payment.status === 'failed' || payment.status === 'abandoned') {
    await db.update(orders).set({ status: payment.status })
      .where(and(eq(orders.id, order.id), inArray(orders.status, [...OPEN_STATUSES])));
    return { status: payment.status, justPaid: false };
  }
  return { status: 'pending', justPaid: false };
}

export async function orderItemsFor(db: Database, orderId: number): Promise<OrderItem[]> {
  return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
}
