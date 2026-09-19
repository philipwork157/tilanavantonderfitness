import type { Database } from '@tilana/db/server';
import { orderItems, orders, payments, programAccess, programFiles, programVolumes } from '@tilana/db/schema';
import { and, eq, gt, inArray, isNull, ne, or } from 'drizzle-orm';
import { CatalogueConflictError, CatalogueNotFoundError } from './program-catalogue';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Serialize file withdrawal with checkout/access writes and preserve one ready
 * file while any current/future entitlement or provider-confirmable sale exists.
 */
export async function assertProgramFileCanDeactivate(
  transaction: Transaction,
  file: { id: number; programVolumeId: number; r2Bucket: string; uploadStatus?: string },
) {
  if (file.uploadStatus !== undefined && file.uploadStatus !== 'ready') return;
  const [volume] = await transaction
    .select({ id: programVolumes.id })
    .from(programVolumes)
    .where(eq(programVolumes.id, file.programVolumeId))
    .limit(1)
    .for('update');
  if (!volume) throw new CatalogueNotFoundError('Program volume not found.');

  const [replacement] = await transaction
    .select({ id: programFiles.id })
    .from(programFiles)
    .where(and(
      eq(programFiles.programVolumeId, file.programVolumeId),
      eq(programFiles.r2Bucket, file.r2Bucket),
      eq(programFiles.uploadStatus, 'ready'),
      eq(programFiles.isActive, true),
      ne(programFiles.id, file.id),
    ))
    .limit(1);
  if (replacement) return;

  const now = new Date();
  const [entitlement] = await transaction
    .select({ id: programAccess.id })
    .from(programAccess)
    .where(and(
      eq(programAccess.programVolumeId, file.programVolumeId),
      eq(programAccess.status, 'active'),
      or(isNull(programAccess.expiresAt), gt(programAccess.expiresAt, now)),
    ))
    .limit(1);

  const [payableOrder] = await transaction
    .select({ id: payments.id })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .innerJoin(payments, eq(payments.orderId, orders.id))
    .where(and(
      eq(orderItems.programVolumeId, file.programVolumeId),
      eq(payments.provider, 'paystack'),
      or(
        and(eq(orders.status, 'pending'), eq(payments.status, 'pending')),
        and(eq(orders.status, 'paid'), inArray(payments.status, ['succeeded', 'partially_refunded'])),
      ),
    ))
    .limit(1);

  if (entitlement || payableOrder) {
    throw new CatalogueConflictError(
      'This is the final active PDF owed to customers or an open checkout. Finalize a replacement, or complete the audited refund/revocation process first.',
    );
  }
}
