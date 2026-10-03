import { createHash } from 'node:crypto';
import type { Database } from '@tilana/db/server';
import { orderItemFiles, orderItems, programFiles, programVolumes } from '@tilana/db/schema';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDatabase } from '@server/utils/database';
import { assertCustomerDeliveryConfigured } from '@server/utils/customer-delivery-configuration';
import { readProgramEmailAttachment } from '@server/utils/r2';
import { validateProgramPdf } from '@server/utils/program-pdf';
import { PURCHASE_ATTACHMENT_MAX_BYTES, PURCHASE_ATTACHMENT_MAX_FILES } from './purchase-program-attachments';

/** Verify every new order's complete email payload before contacting Paystack. */
export async function assertCheckoutDeliveryReady(orderId: number, email: string): Promise<void> {
  await assertCustomerDeliveryConfigured(email);
  const bucket = String(useRuntimeConfig().r2PrivateProgramBucket || '').trim();
  const selectFiles = (database: Pick<Database, 'select'> = getDatabase()) => database.select({
    orderItemId: orderItems.id, clientId: orderItems.clientId, volumeId: orderItems.programVolumeId,
    id: programFiles.id, key: programFiles.r2ObjectKey, size: programFiles.sizeBytes, etag: programFiles.etag,
  }).from(orderItems).leftJoin(programFiles, and(
    eq(programFiles.programVolumeId, orderItems.programVolumeId), eq(programFiles.isActive, true),
    eq(programFiles.uploadStatus, 'ready'), eq(programFiles.contentType, 'application/pdf'), eq(programFiles.r2Bucket, bucket),
  )).where(eq(orderItems.orderId, orderId)).orderBy(asc(orderItems.id), asc(programFiles.id));
  const files = await selectFiles();
  if (!bucket || !files.length || files.some(file => !file.id)) {
    throw createError({ statusCode: 409, statusMessage: 'A program PDF is not available. No payment was started.' });
  }
  if (files.length > PURCHASE_ATTACHMENT_MAX_FILES || files.reduce((total, file) => total + (file.size ?? 0), 0) > PURCHASE_ATTACHMENT_MAX_BYTES) {
    throw createError({ statusCode: 409, statusMessage: 'These programs are too large for one email. Please contact us before paying.' });
  }
  const signal = AbortSignal.timeout(15_000);
  let remaining = PURCHASE_ATTACHMENT_MAX_BYTES;
  const editions: (typeof orderItemFiles.$inferInsert)[] = [];
  try {
    for (const file of files) {
      signal.throwIfAborted();
      const content = await readProgramEmailAttachment(bucket, file.key!, remaining, signal, file.etag);
      if (!content) throw new Error('Email attachment budget exceeded.');
      if (file.size !== null && content.byteLength !== file.size) throw new Error('PDF size changed.');
      await validateProgramPdf(content);
      remaining -= content.byteLength;
      editions.push({ orderItemId: file.orderItemId, clientId: file.clientId, programVolumeId: file.volumeId!,
        programFileId: file.id!, sizeBytes: content.byteLength,
        contentSha256: createHash('sha256').update(content).digest('hex') });
    }
    signal.throwIfAborted();
    await getDatabase().transaction(async transaction => {
      // Finalization takes this same volume lock. Keep network reads outside the transaction,
      // then atomically pin their exact editions before a hosted payment can be opened.
      const volumeIds = [...new Set(editions.map(edition => edition.programVolumeId))];
      await transaction.select({ id: programVolumes.id }).from(programVolumes)
        .where(inArray(programVolumes.id, volumeIds)).orderBy(asc(programVolumes.id)).for('share');
      await transaction.select({ id: programFiles.id }).from(programFiles)
        .where(inArray(programFiles.id, editions.map(edition => edition.programFileId)))
        .orderBy(asc(programFiles.id)).for('share');
      const current = await selectFiles(transaction);
      if (JSON.stringify(current) !== JSON.stringify(files)) throw new Error('PDF edition changed during checkout.');
      await transaction.insert(orderItemFiles).values(editions);
    });
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'The program PDFs could not be prepared for email. Please try again later. No payment was started.' });
  }
}
