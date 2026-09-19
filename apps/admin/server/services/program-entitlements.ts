import type { Database } from '@tilana/db/server';
import { orderItems, programAccess } from '@tilana/db/schema';
import { and, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Shared authorization interval: starts inclusive, expiry exclusive. */
export function currentProgramAccess(now: Date) {
  return and(
    eq(programAccess.status, 'active'),
    lte(programAccess.startsAt, now),
    or(isNull(programAccess.expiresAt), gt(programAccess.expiresAt, now)),
  );
}

/** A paid line gets its own permanent grant, never borrowing a promotion/manual grant. */
export async function grantPurchasedProgram(transaction: Transaction, item: { id: number; clientId: number; programVolumeId: number | null }) {
  if (item.programVolumeId === null) return;
  await transaction.insert(programAccess).values({
    clientId: item.clientId,
    programVolumeId: item.programVolumeId,
    orderItemId: item.id,
    source: 'purchase',
  }).onConflictDoNothing({ target: programAccess.orderItemId });
  // Replays must not resurrect explicitly revoked/expired grants.
}

/** Only this sale's provenance is revoked; all other grants remain untouched. */
export async function revokePurchasedPrograms(transaction: Transaction, orderId: number) {
  const items = await transaction.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, orderId));
  if (!items.length) return;
  const now = new Date();
  await transaction.update(programAccess)
    .set({ status: 'revoked', revokedAt: now, updatedAt: now })
    .where(and(inArray(programAccess.orderItemId, items.map(item => item.id)), eq(programAccess.status, 'active')));
}
