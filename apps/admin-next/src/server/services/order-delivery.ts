import 'server-only';
import { orders, programs, type Database } from '@tilana/db';
import { eq, inArray } from 'drizzle-orm';
import { serverConfig } from '../config';
import { logger } from '../logger';
import { sendEmail } from '../utils/email';
import type { EmailAttachment, OutgoingEmail } from '../utils/email-routing';
import { websiteUrl } from '../utils/newsletter';
import { downloadProgramFile } from '../utils/program-files';
import { orderItemsFor } from './orders';
import { programDeliveryEmail } from './program-emails';
import { saleNotificationEmail } from './sale-emails';

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

/**
 * Emails a paid order's PDFs to the buyer, records the outcome on the order,
 * then tells Tilana about the sale. Call it once, from whoever marked the
 * order paid. Never throws.
 */
export async function deliverOrder(db: Database, orderId: number, deps: DeliveryDependencies = defaults): Promise<void> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.status !== 'paid') return;
  const items = await orderItemsFor(db, order.id);
  let delivered = false;
  let failure: string | null = null;

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
      await deps.send(programDeliveryEmail(order.email, {
        firstName: order.firstName,
        orderNumber: order.orderNumber,
        programs: group.map(file => file.label),
        websiteUrl: site,
        refundPolicyUrl: `${site}/refund-policy`,
      }, group.map(file => file.attachment), { replyTo }));
    }
    delivered = true;
  } catch (error) {
    failure = error instanceof Error ? error.message.slice(0, 500) : 'Unknown error';
    logger.error({ err: error, orderNumber: order.orderNumber }, 'Program email could not be sent');
  }

  await db.update(orders).set(delivered
    ? { deliveryStatus: 'sent', deliveredAt: new Date(), deliveryError: null }
    : { deliveryStatus: 'failed', deliveryError: failure }).where(eq(orders.id, order.id));
  logger.info({ orderNumber: order.orderNumber, delivered }, delivered ? 'Order paid and programs emailed' : 'Order paid but programs not emailed');

  const notifyTo = serverConfig().contactNotifyTo;
  if (!notifyTo) return;
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
    logger.error({ err: error, orderNumber: order.orderNumber }, 'Sale notification could not be sent');
  }
}
