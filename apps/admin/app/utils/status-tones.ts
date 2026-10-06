/** Colour family for a status: maps onto the design-system semantic colours. */
export type StatusTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export const campaignTone: Record<string, StatusTone> = {
  draft: 'neutral',
  sending: 'info',
  paused: 'warning',
  sent: 'success',
};

export const deliveryTone: Record<string, StatusTone> = {
  queued: 'neutral',
  sending: 'info',
  sent: 'success',
  skipped: 'neutral',
  failed: 'danger',
  bounced: 'danger',
  complained: 'warning',
};

export const subscriberTone: Record<string, StatusTone> = {
  pending: 'info',
  subscribed: 'success',
  unsubscribed: 'neutral',
  bounced: 'danger',
  complained: 'warning',
};

export const blogTone: Record<string, StatusTone> = {
  draft: 'neutral',
  published: 'success',
};

export const inquiryTone: Record<string, StatusTone> = {
  new: 'brand',
  replied: 'success',
  archived: 'neutral',
};
