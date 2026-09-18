import { and, eq, isNotNull, or } from 'drizzle-orm';
import { orders } from '@tilana/db/schema';

/** Refunded buyers retain billing access; an unpaid reversal is not a prior purchase. */
export function customerPurchaseHistoryCondition() {
  return or(eq(orders.status, 'paid'), and(eq(orders.status, 'refunded'), isNotNull(orders.paidAt)));
}
