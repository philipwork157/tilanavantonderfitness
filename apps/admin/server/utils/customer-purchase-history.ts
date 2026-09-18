import { and, eq, isNotNull, or, sql } from 'drizzle-orm';
import { invoices, orders } from '@tilana/db/schema';

/** Refunded buyers retain billing access; an unpaid reversal is not a prior purchase. */
export function customerPurchaseHistoryCondition() {
  return or(eq(orders.status, 'paid'), and(eq(orders.status, 'refunded'), isNotNull(orders.paidAt)),
    // Issued service invoices permit billing-only login, never programme downloads.
    sql`exists (select 1 from ${invoices} where ${invoices.orderId} = ${orders.id} and ${invoices.clientId} = ${orders.clientId}
      and ${invoices.managed} = 1 and ${invoices.issuedAt} is not null and ${invoices.status} in ('issued', 'paid', 'void'))`);
}
