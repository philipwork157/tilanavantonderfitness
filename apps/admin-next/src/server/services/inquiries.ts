import 'server-only';
import { desc, eq, inArray } from 'drizzle-orm';
import { inquiries, orders, type Database } from '@tilana/db';
import {
  contactInterestLabels,
  orderHelpTopicLabels,
  orderHelpTopicSchema,
  type ContactFormRequest,
} from '@tilana/contracts/contact';
import { escapeHtml, type OutgoingEmail } from '../utils/email-routing';
import { withPrograms } from './sales';

export interface SavedInquiry {
  id: number;
  name: string;
  email: string;
  interestLabel: string;
  message: string;
  orderTopic: string | null;
  orderNumber: string | null;
  purchaseEmail: string | null;
  privacyAcceptedAt: Date;
}

/** "My programs didn't arrive" for a stored topic key; the key itself if it is no longer offered. */
export function orderTopicLabel(topic: string | null): string | null {
  if (!topic) return null;
  const parsed = orderHelpTopicSchema.safeParse(topic);
  return parsed.success ? orderHelpTopicLabels[parsed.data] : topic;
}

/**
 * Save the enquiry first, then try to email Tilana. The enquiry is never lost
 * because of an email problem; the outcome is recorded on the row instead.
 */
export async function createInquiry(
  db: Database,
  input: ContactFormRequest,
  options: { notify: (inquiry: SavedInquiry) => Promise<void>; now?: Date },
): Promise<{ id: number; notified: boolean }> {
  const [inquiry] = await db.insert(inquiries).values({
    name: input.name,
    email: input.email.toLowerCase(),
    interest: input.interest,
    interestLabel: contactInterestLabels[input.interest],
    message: input.message,
    orderTopic: input.orderTopic ?? null,
    orderNumber: input.orderNumber ?? null,
    purchaseEmail: input.purchaseEmail ?? null,
    privacyAcceptedAt: options.now ?? new Date(),
  }).returning();

  try {
    await options.notify(inquiry!);
    await db.update(inquiries).set({ notifiedAt: new Date(), notificationError: null }).where(eq(inquiries.id, inquiry!.id));
    return { id: inquiry!.id, notified: true };
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(inquiries).set({ notificationError: message.slice(0, 500) }).where(eq(inquiries.id, inquiry!.id));
    return { id: inquiry!.id, notified: false };
  }
}

export type MatchedOrder = Awaited<ReturnType<typeof withPrograms>>[number];

export interface InquiryOrderMatch {
  /** How the orders were found: the order number they gave, their email, or not at all. */
  matchedBy: 'order-number' | 'email' | 'none';
  /** They gave an order number that does not exist. */
  orderNumberNotFound: boolean;
  orders: MatchedOrder[];
}

/**
 * Finds the order an order/payment/refund enquiry is about: the order number
 * they gave, or else the latest orders for the purchase email or their
 * contact email. Never shown to the visitor, only to Tilana.
 */
export async function matchInquiryOrders(
  db: Database,
  inquiry: Pick<SavedInquiry, 'orderNumber' | 'purchaseEmail' | 'email'>,
): Promise<InquiryOrderMatch> {
  if (inquiry.orderNumber) {
    const rows = await db.select().from(orders).where(eq(orders.orderNumber, inquiry.orderNumber)).limit(1);
    if (rows.length) return { matchedBy: 'order-number', orderNumberNotFound: false, orders: await withPrograms(db, rows) };
  }
  const emails = [...new Set([inquiry.purchaseEmail, inquiry.email].filter((value): value is string => Boolean(value)).map(value => value.toLowerCase()))];
  const rows = emails.length
    ? await db.select().from(orders).where(inArray(orders.email, emails)).orderBy(desc(orders.createdAt)).limit(5)
    : [];
  return {
    matchedBy: rows.length ? 'email' : 'none',
    orderNumberNotFound: Boolean(inquiry.orderNumber),
    orders: await withPrograms(db, rows),
  };
}

const ORDER_STATUS_LABELS: Record<MatchedOrder['status'], string> = {
  pending: 'Waiting for payment',
  paid: 'Paid',
  failed: 'Payment failed',
  abandoned: 'Checkout not finished',
  refunded: 'Refunded',
};

const DELIVERY_LABELS: Record<MatchedOrder['deliveryStatus'], string> = {
  pending: 'PDFs not emailed yet',
  sent: 'PDFs emailed',
  failed: 'PDF email failed',
};

const rand = (cents: number) => `R${(cents / 100).toLocaleString('en-ZA', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

/** One line per order for Tilana: "TV-7K4Q9P · Paid · PDFs emailed · R350 · Beginner · Volume 1 · 12 Oct 2026". */
export function describeOrder(order: MatchedOrder): string {
  const parts = [
    order.orderNumber,
    order.testPayment ? 'TEST payment' : null,
    ORDER_STATUS_LABELS[order.status],
    order.status === 'paid' ? DELIVERY_LABELS[order.deliveryStatus] : null,
    order.refundStatus === 'pending' ? 'refund in progress' : order.refundStatus === 'failed' ? 'refund failed' : null,
    rand(order.totalCents),
    order.programs.join(', ') || null,
    dateFormatShort.format(new Date(order.paidAt ?? order.createdAt)),
  ];
  return parts.filter(Boolean).join(' · ');
}

const dateFormatShort = new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeZone: 'Africa/Johannesburg' });

/** The "Order" lines of Tilana's email, or null when the enquiry is not about an order. */
export function orderMatchSummary(inquiry: Pick<SavedInquiry, 'orderTopic' | 'orderNumber'>, match: InquiryOrderMatch | null): string[] | null {
  if (!inquiry.orderTopic || !match) return null;
  if (match.matchedBy === 'order-number') return [describeOrder(match.orders[0]!)];
  const lines: string[] = [];
  if (match.orderNumberNotFound) lines.push(`No order ${inquiry.orderNumber} was found.`);
  if (match.matchedBy === 'email') {
    lines.push(match.orders.length === 1 ? 'Order for this email:' : `Latest ${match.orders.length} orders for this email:`);
    lines.push(...match.orders.map(describeOrder));
  }
  else {
    lines.push('No orders found for this email. They may have used another address.');
  }
  return lines;
}

const dateFormat = new Intl.DateTimeFormat('en-ZA', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Africa/Johannesburg',
});

/** Notification for Tilana. Replying goes straight to the visitor. */
export function inquiryNotificationEmail(inquiry: SavedInquiry, to: string, match: InquiryOrderMatch | null = null): OutgoingEmail {
  const accepted = `${dateFormat.format(inquiry.privacyAcceptedAt)} (SAST)`;
  const topic = orderTopicLabel(inquiry.orderTopic);
  const rows: [string, string][] = [
    ['Name', inquiry.name],
    ['Email', inquiry.email],
    ['Interested in', inquiry.interestLabel],
    ...(topic ? [['Needs help with', topic] as [string, string]] : []),
    ...(inquiry.orderTopic ? [['Order number', inquiry.orderNumber ?? 'Not given'] as [string, string]] : []),
    ...(inquiry.purchaseEmail && inquiry.purchaseEmail !== inquiry.email ? [['Bought with', inquiry.purchaseEmail] as [string, string]] : []),
    ['Privacy policy accepted', accepted],
  ];
  const orderLines = orderMatchSummary(inquiry, match);
  const message = inquiry.message || '(No message: the topic above says what they need.)';

  const text = [
    'New enquiry from the website',
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    ...(orderLines ? ['', 'Order (from the admin):', ...orderLines] : []),
    '',
    'Message:',
    message,
    '',
    `Reply to this email to answer ${inquiry.name} directly.`,
  ].join('\n');

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6e4d9;font-family:Montserrat,Arial,sans-serif;color:#614635">
<div style="max-width:560px;margin:0 auto;padding:28px;background:#ffffff;border:1px solid #e0c3ae;border-radius:14px">
<p style="margin:0 0 4px;font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase">New enquiry</p>
<h1 style="margin:0 0 20px;font-family:Georgia,serif;font-weight:400;font-size:24px;color:#0f0e13">${escapeHtml(inquiry.name)}</h1>
<table style="border-collapse:collapse;width:100%;font-size:14px">${rows.map(([label, value]) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#765743;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 0;color:#0f0e13">${escapeHtml(value)}</td></tr>`).join('')}</table>
${orderLines ? `<div style="margin:20px 0 0;padding:14px 16px;background:#fbf3ee;border:1px solid #e0c3ae;border-radius:10px">
<p style="margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#765743">Order</p>
${orderLines.map(line => `<p style="margin:0 0 4px;font-size:14px;line-height:1.5;color:#0f0e13">${escapeHtml(line)}</p>`).join('')}
<p style="margin:8px 0 0;font-size:12px;color:#765743">Open Sales in the admin to email the PDFs again or refund.</p>
</div>` : ''}
<p style="margin:20px 0 6px;font-size:14px;font-weight:600;color:#0f0e13">Message</p>
<p style="margin:0;font-size:14px;line-height:1.65;white-space:pre-wrap">${escapeHtml(message)}</p>
<p style="margin:24px 0 0;font-size:12px;color:#765743">Reply to this email to answer ${escapeHtml(inquiry.name)} directly.</p>
</div></body></html>`;

  return {
    to: [to],
    replyTo: [inquiry.email],
    subject: topic
      ? `${topic} · ${inquiry.name}${inquiry.orderNumber ? ` · ${inquiry.orderNumber}` : ''}`
      : `New enquiry from ${inquiry.name} · ${inquiry.interestLabel}`,
    text,
    html,
  };
}
