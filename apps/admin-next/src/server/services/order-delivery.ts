import 'server-only';
import { orders, programs, type Database } from '@tilana/db';
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { serverConfig } from '../config';
import { logger } from '../logger';
import { sendEmail } from '../utils/email';
import type { EmailAttachment, OutgoingEmail } from '../utils/email-routing';
import { websiteUrl } from '../utils/newsletter';
import { downloadProgramFile } from '../utils/program-files';
import { orderItemsFor } from './orders';
import { programDeliveryEmail } from './program-emails';
import { orderAlertEmail, saleNotificationEmail } from './sale-emails';

/** Keeps each delivery email well under the SES size limit (attachments grow by a third when encoded). */
const MAX_ATTACHMENT_BYTES_PER_EMAIL = 20 * 1024 * 1024;

export interface DeliveryDependencies {
  send: (email: OutgoingEmail) => Promise<unknown>;
  download: (key: string) => Promise<Buffer>;
}

const defaults: DeliveryDependencies = { send: sendEmail, download: downloadProgramFile };

/** Splits attachments into emails that stay under the size limit. */
export function groupAttachments<T extends { attachment: EmailAttachment }>(files: T[], limit = MAX_ATTACHMENT_BYTES_PER_EMAIL): T[][] {
  const groups: T[][] = [];
  let size = 0;
  for (const file of files) {
    const bytes = file.attachment.data.byteLength;
    if (!groups.length || size + bytes > limit) {
      groups.push([]);
      size = 0;
    }
    groups[groups.length - 1]!.push(file);
    size += bytes;
  }
  return groups;
}

type PaidOrder = typeof orders.$inferSelect;

/** Downloads the order's PDFs and emails them to `to`. Never throws. */
async function emailPrograms(db: Database, order: PaidOrder, to: string, deps: DeliveryDependencies) {
  const items = await orderItemsFor(db, order.id);
  try {
    const site = websiteUrl();
    const ids = items.map(item => item.programId).filter((id): id is number => id !== null);
    const files = ids.length ? await db.select({ id: programs.id, filePath: programs.filePath, fileName: programs.fileName }).from(programs).where(inArray(programs.id, ids)) : [];
    const attachments = [];
    for (const item of items) {
      const file = files.find(row => row.id === item.programId);
      if (!file?.filePath || !file.fileName) throw new Error(`No PDF for ${item.label}.`);
      const data = await deps.download(file.filePath);
      attachments.push({ label: item.label, attachment: { fileName: file.fileName, contentType: 'application/pdf', data: new Uint8Array(data) } });
    }
    const replyTo = serverConfig().contactNotifyTo || undefined;
    for (const group of groupAttachments(attachments)) {
      await deps.send(programDeliveryEmail(to, {
        firstName: order.firstName,
        orderNumber: order.orderNumber,
        programs: group.map(file => file.label),
        websiteUrl: site,
        refundPolicyUrl: `${site}/refund-policy`,
      }, group.map(file => file.attachment), { replyTo }));
    }
    return { items, delivered: true, failure: null };
  } catch (error) {
    logger.error({ err: error, orderNumber: order.orderNumber }, 'Program email could not be sent');
    return { items, delivered: false, failure: error instanceof Error ? error.message.slice(0, 500) : 'Unknown error' };
  }
}

/** Records the latest delivery attempt on the order. */
async function recordDelivery(db: Database, orderId: number, delivered: boolean, failure: string | null) {
  await db.update(orders).set(delivered
    ? { deliveryStatus: 'sent', deliveredAt: new Date(), deliveryError: null }
    : { deliveryStatus: 'failed', deliveryError: failure }).where(eq(orders.id, orderId));
}

/**
 * Emails a paid order's PDFs to the buyer, records the outcome on the order,
 * then tells Tilana about the sale (once per order, however many attempts).
 * Called by whoever marked the order paid, and again by the background order
 * checks for deliveries that failed or never ran. Never throws.
 */
export async function deliverOrder(db: Database, orderId: number, deps: DeliveryDependencies = defaults): Promise<void> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.status !== 'paid' || order.deliveryStatus === 'sent') return;
  // Claim this attempt, so two runs never email the same attempt twice.
  const claimed = await db.update(orders).set({ deliveryAttempts: order.deliveryAttempts + 1 })
    .where(and(eq(orders.id, order.id), eq(orders.deliveryAttempts, order.deliveryAttempts), ne(orders.deliveryStatus, 'sent')))
    .returning({ id: orders.id });
  if (!claimed.length) return;

  const { items, delivered, failure } = await emailPrograms(db, order, order.email, deps);
  await recordDelivery(db, order.id, delivered, failure);
  logger.info({ orderNumber: order.orderNumber, delivered, attempt: order.deliveryAttempts + 1 }, delivered ? 'Programs emailed' : 'Programs not emailed');
  await notifySale(db, order, items, delivered, deps);
}

/** Tilana's "New sale" email, sent once per order (claimed in the database first). */
async function notifySale(db: Database, order: PaidOrder, items: Awaited<ReturnType<typeof orderItemsFor>>, delivered: boolean, deps: DeliveryDependencies) {
  const notifyTo = serverConfig().contactNotifyTo;
  if (!notifyTo) return;
  const claimed = await db.update(orders).set({ saleNotifiedAt: new Date() })
    .where(and(eq(orders.id, order.id), isNull(orders.saleNotifiedAt))).returning({ id: orders.id });
  if (!claimed.length) return;
  try {
    await deps.send(saleNotificationEmail(notifyTo, {
      orderNumber: order.orderNumber,
      buyerName: `${order.firstName} ${order.lastName}`.trim(),
      buyerEmail: order.email,
      items: items.map(item => ({ label: item.label, priceCents: item.priceCents })),
      totalCents: order.totalCents,
      delivered,
      testMode: order.paymentMode === 'test',
      adminUrl: null,
    }));
  } catch (error) {
    // Let a later check try again.
    await db.update(orders).set({ saleNotifiedAt: null }).where(eq(orders.id, order.id));
    logger.error({ err: error, orderNumber: order.orderNumber }, 'Sale notification could not be sent');
  }
}

/** Emails Tilana that an order needs a person. Never throws. */
export async function alertOrder(order: Pick<PaidOrder, 'orderNumber' | 'paymentMode'>, title: string, lines: string[], deps: Pick<DeliveryDependencies, 'send'> = defaults): Promise<void> {
  const notifyTo = serverConfig().contactNotifyTo;
  if (!notifyTo) return;
  try {
    await deps.send(orderAlertEmail(notifyTo, { orderNumber: order.orderNumber, title, lines, testMode: order.paymentMode === 'test' }));
  } catch (error) {
    logger.error({ err: error, orderNumber: order.orderNumber }, 'Order alert could not be sent');
  }
}

/**
 * Emails a paid order's PDFs again (lost email, typo in the address, failed
 * first attempt). Sends to the buyer's address unless the admin gives another
 * one; the order keeps the buyer's original address. No sale notification.
 */
export async function resendOrder(
  db: Database,
  orderNumber: string,
  options: { to?: string } = {},
  deps: DeliveryDependencies = defaults,
): Promise<{ delivered: boolean; failure: string | null; sentTo: string } | null> {
  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber));
  if (!order || order.status !== 'paid') return null;
  const sentTo = options.to?.trim().toLowerCase() || order.email;
  const { delivered, failure } = await emailPrograms(db, order, sentTo, deps);
  await recordDelivery(db, order.id, delivered, failure);
  logger.info({ orderNumber, delivered, otherAddress: sentTo !== order.email }, delivered ? 'Programs emailed again' : 'Programs could not be emailed again');
  return { delivered, failure, sentTo };
}
