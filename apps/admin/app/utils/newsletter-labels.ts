/** Words shown for newsletter states in the admin. */
export const campaignStatusLabel: Record<string, string> = {
  draft: 'Draft',
  sending: 'Sending',
  paused: 'Paused',
  sent: 'Sent',
};

export const deliveryStatusLabel: Record<string, string> = {
  queued: 'Waiting',
  sending: 'Sending',
  sent: 'Sent',
  skipped: 'Skipped',
  failed: 'Failed',
  bounced: 'Bounced',
  complained: 'Marked as spam',
};

export const subscriberStatusLabel: Record<string, string> = {
  pending: 'Waiting for confirmation',
  subscribed: 'Subscribed',
  unsubscribed: 'Unsubscribed',
  bounced: 'Bounced',
  complained: 'Marked as spam',
};
