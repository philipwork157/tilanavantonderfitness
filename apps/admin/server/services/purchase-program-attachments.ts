import type { EmailAttachment } from '@tilana/email/server';
import { orderItems, orders, programAccess, programFiles } from '@tilana/db/schema';
import { and, asc, eq } from 'drizzle-orm';
import { getDatabase } from '@server/utils/database';
import { readProgramEmailAttachment } from '@server/utils/r2';
import { currentProgramAccess } from './program-entitlements';

// Leave room for base64 encoding and email content within common inbox limits.
export const PURCHASE_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;
export const PURCHASE_ATTACHMENT_MAX_FILES = 30;

/** Only this paid order's current purchase grants may supply private email attachments. */
export async function getPurchaseProgramAttachments(orderId: number, clientId: number, signal: AbortSignal): Promise<EmailAttachment[] | null> {
  signal.throwIfAborted();
  const bucket = String(useRuntimeConfig().r2PrivateProgramBucket || '').trim();
  if (!bucket) throw new Error('Private program storage is not configured.');
  const selectFiles = () => getDatabase().selectDistinct({
    id: programFiles.id, bucket: programFiles.r2Bucket, key: programFiles.r2ObjectKey,
    filename: programFiles.originalFilename, name: programFiles.displayName,
    size: programFiles.sizeBytes, sortOrder: programFiles.sortOrder,
  }).from(orderItems)
    .innerJoin(orders, and(eq(orders.id, orderItems.orderId), eq(orders.clientId, orderItems.clientId)))
    .innerJoin(programAccess, and(eq(programAccess.orderItemId, orderItems.id),
      eq(programAccess.clientId, orderItems.clientId), eq(programAccess.programVolumeId, orderItems.programVolumeId),
      eq(programAccess.source, 'purchase'), currentProgramAccess(new Date())))
    .leftJoin(programFiles, and(eq(programFiles.programVolumeId, orderItems.programVolumeId),
      eq(programFiles.isActive, true), eq(programFiles.uploadStatus, 'ready'),
      eq(programFiles.contentType, 'application/pdf'), eq(programFiles.r2Bucket, bucket)))
    .where(and(eq(orders.id, orderId), eq(orders.clientId, clientId), eq(orders.status, 'paid')))
    .orderBy(asc(programFiles.sortOrder), asc(programFiles.id));
  const files = await selectFiles();
  if (!files.length) return null; // Refund/revocation must not send private content.
  if (files.some(file => !file.id)) throw new Error('Purchased program PDF is missing.');
  // Oversized baskets get an honest portal-only email, never a misleading partial set.
  if (files.length > PURCHASE_ATTACHMENT_MAX_FILES || files.reduce((total, file) => total + (file.size ?? 0), 0) > PURCHASE_ATTACHMENT_MAX_BYTES) return [];
  const attachments: EmailAttachment[] = [];
  let remaining = PURCHASE_ATTACHMENT_MAX_BYTES;
  for (const file of files) {
    signal.throwIfAborted();
    const content = await readProgramEmailAttachment(file.bucket!, file.key!, remaining, signal);
    if (!content) return [];
    remaining -= content.byteLength;
    // Normalize names to PDFs and strip header controls, path separators and unsafe punctuation.
    const stem = (file.filename || file.name || 'Program').replace(/\.pdf$/i, '').replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(0, 180);
    attachments.push({ filename: `${file.id}-${stem}.pdf`, contentType: 'application/pdf', content });
  }
  // Recheck after storage reads so a refund/revocation or file replacement during
  // assembly cannot authorize stale content. Already accepted mail cannot be recalled.
  signal.throwIfAborted();
  const current = await selectFiles();
  if (!current.length) return null;
  if (current.length !== files.length || current.some((file, index) => file.id !== files[index]?.id)) {
    throw new Error('Purchased program files changed during email preparation.');
  }
  return attachments;
}
