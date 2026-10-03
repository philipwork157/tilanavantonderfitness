import { orderItems, programFiles } from '@tilana/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { getDatabase } from '@server/utils/database';
import { assertCustomerDeliveryConfigured } from '@server/utils/customer-delivery-configuration';
import { readProgramEmailAttachment } from '@server/utils/r2';
import { validateProgramPdf } from '@server/utils/program-pdf';
import { PURCHASE_ATTACHMENT_MAX_BYTES, PURCHASE_ATTACHMENT_MAX_FILES } from './purchase-program-attachments';

/** Verify every new order's complete email payload before contacting Paystack. */
export async function assertCheckoutDeliveryReady(orderId: number, email: string): Promise<void> {
  await assertCustomerDeliveryConfigured(email);
  const bucket = String(useRuntimeConfig().r2PrivateProgramBucket || '').trim();
  const selectFiles = () => getDatabase().select({
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
  try {
    for (const file of files) {
      signal.throwIfAborted();
      const content = await readProgramEmailAttachment(bucket, file.key!, remaining, signal, file.etag);
      if (!content) throw new Error('Email attachment budget exceeded.');
      if (file.size !== null && content.byteLength !== file.size) throw new Error('PDF size changed.');
      await validateProgramPdf(content);
      remaining -= content.byteLength;
    }
    signal.throwIfAborted();
    const current = await selectFiles();
    if (JSON.stringify(current) !== JSON.stringify(files)) throw new Error('PDF edition changed during checkout.');
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'The program PDFs could not be prepared for email. Please try again later. No payment was started.' });
  }
}
