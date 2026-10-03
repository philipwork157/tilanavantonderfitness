import type { EmailAttachment } from '@tilana/email/server';
import { PROGRAM_EMAIL_ATTACHMENT_MAX_BYTES, PROGRAM_EMAIL_ATTACHMENT_MAX_FILES } from '@tilana/contracts/catalogue';
import { createHash } from 'node:crypto';
import { orderItemFiles, orderItems, orders, programAccess, programFiles } from '@tilana/db/schema';
import { and, asc, eq, sql } from 'drizzle-orm';
import { getDatabase } from '@server/utils/database';
import { readProgramEmailAttachment } from '@server/utils/r2';
import { validateProgramPdf } from '@server/utils/program-pdf';
import { currentProgramAccess } from './program-entitlements';

// Leave room for base64 encoding and email content within common inbox limits.
export const PURCHASE_ATTACHMENT_MAX_BYTES = PROGRAM_EMAIL_ATTACHMENT_MAX_BYTES;
export const PURCHASE_ATTACHMENT_MAX_FILES = PROGRAM_EMAIL_ATTACHMENT_MAX_FILES;

/** Only this paid order's current purchase grants may supply private email attachments. */
export async function getPurchaseProgramAttachments(orderId: number, clientId: number, signal: AbortSignal): Promise<EmailAttachment[] | null> {
  signal.throwIfAborted();
  const bucket = String(useRuntimeConfig().r2PrivateProgramBucket || '').trim();
  if (!bucket) throw new Error('Private program storage is not configured.');
  const [edition] = await getDatabase().select({ id: orderItemFiles.id }).from(orderItemFiles)
    .innerJoin(orderItems, eq(orderItems.id, orderItemFiles.orderItemId)).where(eq(orderItems.orderId, orderId)).limit(1);
  const pinned = Boolean(edition);
  const selectFiles = () => getDatabase().selectDistinct({
    id: programFiles.id, bucket: programFiles.r2Bucket, key: programFiles.r2ObjectKey,
    filename: programFiles.originalFilename, name: programFiles.displayName,
    size: pinned ? orderItemFiles.sizeBytes : programFiles.sizeBytes,
    digest: pinned ? orderItemFiles.contentSha256 : sql<string | null>`null`,
    sortOrder: programFiles.sortOrder, etag: programFiles.etag,
  }).from(orderItems)
    .innerJoin(orders, and(eq(orders.id, orderItems.orderId), eq(orders.clientId, orderItems.clientId)))
    .innerJoin(programAccess, and(eq(programAccess.orderItemId, orderItems.id),
      eq(programAccess.clientId, orderItems.clientId), eq(programAccess.programVolumeId, orderItems.programVolumeId),
      eq(programAccess.source, 'purchase'), currentProgramAccess(new Date())))
    .leftJoin(orderItemFiles, and(eq(orderItemFiles.orderItemId, orderItems.id),
      eq(orderItemFiles.clientId, orderItems.clientId), eq(orderItemFiles.programVolumeId, orderItems.programVolumeId)))
    .leftJoin(programFiles, and(pinned ? eq(programFiles.id, orderItemFiles.programFileId)
      : and(eq(programFiles.programVolumeId, orderItems.programVolumeId), eq(programFiles.isActive, true)),
      eq(programFiles.uploadStatus, 'ready'),
      eq(programFiles.contentType, 'application/pdf'), eq(programFiles.r2Bucket, bucket)))
    .where(and(eq(orders.id, orderId), eq(orders.clientId, clientId), eq(orders.status, 'paid')))
    .orderBy(asc(programFiles.sortOrder), asc(programFiles.id));
  const files = await selectFiles();
  if (!files.length) return null; // Refund/revocation must not send private content.
  if (files.some(file => !file.id)) throw new Error('Purchased program PDF is missing.');
  // Only legacy purchases may fall back to portal instructions. New checkouts pin a
  // verified, bounded payload and must never acknowledge an attachment-free email.
  if (files.length > PURCHASE_ATTACHMENT_MAX_FILES || files.reduce((total, file) => total + (file.size ?? 0), 0) > PURCHASE_ATTACHMENT_MAX_BYTES) {
    if (pinned) throw new Error('Purchased PDF snapshot exceeds the email limit.');
    return [];
  }
  const attachments: EmailAttachment[] = [];
  let remaining = PURCHASE_ATTACHMENT_MAX_BYTES;
  for (const file of files) {
    signal.throwIfAborted();
    const content = await readProgramEmailAttachment(file.bucket!, file.key!, remaining, signal, file.etag);
    if (!content) {
      if (pinned) throw new Error('Purchased PDF snapshot exceeds the email limit.');
      return [];
    }
    if (pinned && (content.byteLength !== file.size || createHash('sha256').update(content).digest('hex') !== file.digest)) {
      throw new Error('Purchased PDF snapshot content changed.');
    }
    await validateProgramPdf(content);
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
  if (current.length !== files.length || current.some((file, index) => file.id !== files[index]?.id || file.etag !== files[index]?.etag)) {
    throw new Error('Purchased program files changed during email preparation.');
  }
  return attachments;
}
