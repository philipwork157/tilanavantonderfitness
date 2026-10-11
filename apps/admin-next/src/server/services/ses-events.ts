import 'server-only';
/**
 * Bounce and complaint reports from Amazon SES, delivered by Amazon SNS to
 * POST /api/webhooks/ses. Every message is checked against Amazon's signing
 * certificate and the configured topic before anything is changed.
 */
import { createVerify } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { newsletterDeliveries, orders, type Database } from '@tilana/db';
import { logger } from '../logger';
import { suppressSubscriber } from './newsletter-subscribers';
import { DELIVERY_SCHEDULE } from './order-checks';
import { alertOrder } from './order-delivery';

export interface SnsMessage {
  Type: 'Notification' | 'SubscriptionConfirmation' | 'UnsubscribeConfirmation';
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  Subject?: string;
  SubscribeURL?: string;
  Token?: string;
}

/** Only Amazon SNS hosts may serve certificates and subscription links. */
export function isAmazonSnsUrl(value: string | undefined, kind: 'certificate' | 'subscribe'): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    if (!/^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/.test(url.hostname)) return false;
    return kind === 'certificate' ? url.pathname.endsWith('.pem') : url.searchParams.get('Action') === 'ConfirmSubscription';
  }
  catch {
    return false;
  }
}

/** The exact text Amazon signs (field order matters). */
export function snsStringToSign(message: SnsMessage): string {
  const fields = message.Type === 'Notification'
    ? ['Message', 'MessageId', ...(message.Subject !== undefined ? ['Subject'] : []), 'Timestamp', 'TopicArn', 'Type']
    : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];
  return fields.map(field => `${field}\n${message[field as keyof SnsMessage] ?? ''}\n`).join('');
}

export function parseSnsMessage(raw: unknown): SnsMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const message = raw as Record<string, unknown>;
  const strings = ['Type', 'MessageId', 'TopicArn', 'Message', 'Timestamp', 'SignatureVersion', 'Signature', 'SigningCertURL'];
  if (!strings.every(key => typeof message[key] === 'string')) return null;
  if (!['Notification', 'SubscriptionConfirmation', 'UnsubscribeConfirmation'].includes(message.Type as string)) return null;
  return message as unknown as SnsMessage;
}

/**
 * True when the message was signed by Amazon SNS. `loadCertificate` fetches
 * the PEM certificate (cached by the caller).
 */
export async function verifySnsSignature(
  message: SnsMessage,
  loadCertificate: (url: string) => Promise<string>,
): Promise<boolean> {
  if (!isAmazonSnsUrl(message.SigningCertURL, 'certificate')) return false;
  const algorithm = message.SignatureVersion === '1' ? 'RSA-SHA1' : message.SignatureVersion === '2' ? 'RSA-SHA256' : null;
  if (!algorithm) return false;
  try {
    const certificate = await loadCertificate(message.SigningCertURL);
    return createVerify(algorithm).update(snsStringToSign(message)).verify(certificate, message.Signature, 'base64');
  }
  catch {
    return false;
  }
}

interface SesRecipient { emailAddress?: string; diagnosticCode?: string }
interface SesEvent {
  notificationType?: string;
  eventType?: string;
  mail?: { messageId?: string };
  bounce?: { bounceType?: string; bounceSubType?: string; bouncedRecipients?: SesRecipient[] };
  complaint?: { complaintFeedbackType?: string; complainedRecipients?: SesRecipient[] };
}

export type SesEventOutcome = 'bounced' | 'complained' | 'ignored';

/**
 * A bounced PDF email: the buyer has nothing, although the order said "sent".
 * The order is marked not sent (no more automatic tries to a dead address)
 * and Tilana is told, so she can send the PDFs to a corrected address.
 */
async function markOrderEmailBounced(db: Database, messageId: string, reason: string) {
  const [order] = await db.select({ id: orders.id, orderNumber: orders.orderNumber, paymentMode: orders.paymentMode, email: orders.email })
    .from(orders).where(sql`${messageId} = any(${orders.deliveryMessageIds})`).limit(1);
  if (!order) return;
  await db.update(orders).set({
    deliveryStatus: 'failed',
    deliveryError: `The buyer's email provider refused the PDFs. ${reason}`.slice(0, 500),
    deliveryAttempts: DELIVERY_SCHEDULE.length,
  }).where(eq(orders.id, order.id));
  logger.warn({ orderNumber: order.orderNumber }, 'Program email bounced');
  await alertOrder(order, 'The PDF email bounced', [
    `The email with the PDFs for this order could not be delivered to ${order.email}.`,
    `Reason: ${reason}`,
    'Check the address with the buyer, then use "Email PDFs again" on the Sales page with the right address.',
  ]);
}

/**
 * Applies one SES report. Permanent bounces and complaints suppress the
 * subscriber (found through the delivery's SES message id, or by address for
 * confirmation emails). Temporary bounces are ignored; SES retries those.
 */
export async function applySesEvent(db: Database, payload: unknown, now = new Date()): Promise<SesEventOutcome> {
  const event = (payload ?? {}) as SesEvent;
  const type = event.notificationType ?? event.eventType;
  let kind: 'bounced' | 'complained';
  let recipients: SesRecipient[];
  let reason: string;

  if (type === 'Bounce' && event.bounce?.bounceType === 'Permanent') {
    kind = 'bounced';
    recipients = event.bounce.bouncedRecipients ?? [];
    reason = `Bounced (${event.bounce.bounceSubType ?? 'Permanent'})`;
  }
  else if (type === 'Complaint') {
    kind = 'complained';
    recipients = event.complaint?.complainedRecipients ?? [];
    reason = `Marked as spam${event.complaint?.complaintFeedbackType ? ` (${event.complaint.complaintFeedbackType})` : ''}`;
  }
  else {
    return 'ignored';
  }

  const messageId = event.mail?.messageId;
  const [delivery] = messageId
    ? await db.select({ id: newsletterDeliveries.id, subscriberId: newsletterDeliveries.subscriberId })
      .from(newsletterDeliveries).where(eq(newsletterDeliveries.sesMessageId, messageId)).limit(1)
    : [];

  const detail = recipients.map(person => person.diagnosticCode).filter(Boolean).join('; ');
  const fullReason = detail ? `${reason}: ${detail}` : reason;

  if (kind === 'bounced' && messageId) await markOrderEmailBounced(db, messageId, fullReason);

  if (delivery) {
    await db.update(newsletterDeliveries).set({ status: kind, error: fullReason.slice(0, 500) })
      .where(and(eq(newsletterDeliveries.id, delivery.id)));
    if (delivery.subscriberId) await suppressSubscriber(db, { id: delivery.subscriberId }, kind, fullReason, now);
  }
  else {
    for (const person of recipients) {
      if (person.emailAddress) await suppressSubscriber(db, { email: person.emailAddress }, kind, fullReason, now);
    }
  }
  return kind;
}
