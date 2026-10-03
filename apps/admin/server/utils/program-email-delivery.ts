import type { ProgramEmailDeliveryStatus } from '@tilana/contracts/clients';

interface PurchaseNotificationState {
  id: number;
  attempts: number;
  sentAt: Date | null;
  canceledAt: Date | null;
}

/** Match the existing checkout status without treating SES acceptance as inbox delivery. */
export function getProgramEmailDeliveryStatus(notification: PurchaseNotificationState | null | undefined): ProgramEmailDeliveryStatus {
  if (!notification) return 'unavailable';
  if (notification.canceledAt) return 'canceled';
  if (notification.sentAt) return 'sent';
  return notification.attempts > 0 ? 'retrying' : 'pending';
}
