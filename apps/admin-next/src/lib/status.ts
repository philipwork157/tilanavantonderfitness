/** Words and colours for statuses across the admin. */
export type StatusTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export interface StatusStyle {
  label: string;
  tone: StatusTone;
}

export const inquiryStatus: Record<string, StatusStyle> = {
  new: { label: 'New', tone: 'brand' },
  replied: { label: 'Replied', tone: 'success' },
  archived: { label: 'Archived', tone: 'neutral' },
};

export const blogStatus: Record<string, StatusStyle> = {
  draft: { label: 'Draft', tone: 'neutral' },
  published: { label: 'Published', tone: 'success' },
};

export const campaignStatus: Record<string, StatusStyle> = {
  draft: { label: 'Draft', tone: 'neutral' },
  sending: { label: 'Sending', tone: 'info' },
  paused: { label: 'Paused', tone: 'warning' },
  sent: { label: 'Sent', tone: 'success' },
};

export const deliveryStatus: Record<string, StatusStyle> = {
  queued: { label: 'Waiting', tone: 'neutral' },
  sending: { label: 'Sending', tone: 'info' },
  sent: { label: 'Sent', tone: 'success' },
  skipped: { label: 'Skipped', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'danger' },
  bounced: { label: 'Bounced', tone: 'danger' },
  complained: { label: 'Marked as spam', tone: 'warning' },
};

export const subscriberStatus: Record<string, StatusStyle> = {
  pending: { label: 'Waiting for confirmation', tone: 'info' },
  subscribed: { label: 'Subscribed', tone: 'success' },
  unsubscribed: { label: 'Unsubscribed', tone: 'neutral' },
  bounced: { label: 'Bounced', tone: 'danger' },
  complained: { label: 'Marked as spam', tone: 'warning' },
};

/** Style for a status, falling back to the raw value in neutral. */
export function statusStyle(map: Record<string, StatusStyle>, value: string): StatusStyle {
  return map[value] ?? { label: value, tone: 'neutral' };
}

export const orderStatus: Record<string, StatusStyle> = {
  paid: { label: 'Paid', tone: 'success' },
  pending: { label: 'Awaiting payment', tone: 'info' },
  failed: { label: 'Payment failed', tone: 'danger' },
  abandoned: { label: 'Not completed', tone: 'neutral' },
  refunded: { label: 'Refunded', tone: 'neutral' },
};

export const orderRefundStatus: Record<string, StatusStyle> = {
  pending: { label: 'Refund pending', tone: 'warning' },
  failed: { label: 'Refund failed', tone: 'danger' },
};

export const orderDeliveryStatus: Record<string, StatusStyle> = {
  sent: { label: 'PDFs emailed', tone: 'success' },
  pending: { label: 'Sending PDFs', tone: 'info' },
  failed: { label: 'Email failed', tone: 'danger' },
};
