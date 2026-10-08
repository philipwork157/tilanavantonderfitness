import 'server-only';
import { createHash } from 'node:crypto';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { MAX_PROGRAM_PDF_BYTES } from '@tilana/contracts/admin-programs';
import { serverConfig } from '../config';
import { HttpError } from '../http';

/**
 * Private storage for program PDFs in Cloudflare R2 (S3 API). The bucket is
 * never public: only the server reads files, to attach them to emails or let
 * an admin download one. Uploads and downloads use separate scoped tokens.
 * Never build a public URL for these files.
 */

export const r2Endpoint = (accountId: string) => `https://${accountId}.r2.cloudflarestorage.com`;

const clients = new Map<string, S3Client>();

function r2(access: 'upload' | 'download'): { client: S3Client; bucket: string } {
  const config = serverConfig();
  const keyId = access === 'upload' ? config.r2UploadAccessKeyId : config.r2DownloadAccessKeyId;
  const secret = access === 'upload' ? config.r2UploadSecretAccessKey : config.r2DownloadSecretAccessKey;
  if (!config.r2AccountId || !config.r2ProgramBucket || !keyId || !secret) {
    throw new HttpError(503, 'Program file storage (Cloudflare R2) is not configured yet.');
  }
  let client = clients.get(access);
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: r2Endpoint(config.r2AccountId),
      credentials: { accessKeyId: keyId, secretAccessKey: secret },
    });
    clients.set(access, client);
  }
  return { client, bucket: config.r2ProgramBucket };
}

export class PdfRejectedError extends Error {}

/** Checks that an upload really is a PDF and returns its SHA-256. */
export function inspectPdf(data: Buffer): { sha256: string } {
  if (data.length === 0) throw new PdfRejectedError('The file is empty.');
  if (data.length > MAX_PROGRAM_PDF_BYTES) throw new PdfRejectedError('PDFs must be 15 MB or smaller so they fit in an email.');
  // Every PDF starts with "%PDF-" and ends with "%%EOF" (sometimes followed by whitespace).
  if (data.subarray(0, 5).toString('latin1') !== '%PDF-') throw new PdfRejectedError('This file is not a PDF.');
  if (!data.subarray(Math.max(0, data.length - 2048)).toString('latin1').includes('%%EOF')) {
    throw new PdfRejectedError('This PDF looks incomplete. Please export it again.');
  }
  return { sha256: createHash('sha256').update(data).digest('hex') };
}

/** Object key for one version of a volume's PDF; older versions stay for past orders. */
export const programFileKey = (volumeId: number, version: number, sha256: string) =>
  `volumes/${volumeId}/v${version}-${sha256.slice(0, 12)}.pdf`;

export async function uploadProgramFile(volumeId: number, version: number, sha256: string, data: Buffer): Promise<string> {
  const { client, bucket } = r2('upload');
  const key = programFileKey(volumeId, version, sha256);
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: 'application/pdf',
      ContentLength: data.length,
    }));
  } catch (error) {
    console.error('R2 upload failed', error);
    throw new HttpError(502, 'The PDF could not be stored. Please try again.');
  }
  return key;
}

export async function downloadProgramFile(key: string): Promise<Buffer> {
  const { client, bucket } = r2('download');
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!result.Body) throw new Error(`Program file could not be read: ${key}`);
  return Buffer.from(await result.Body.transformToByteArray());
}

/** "Tilana van Tonder - Beginner Volume 1.pdf" from "Beginner · Volume 1". */
export function programFileName(volumeName: string): string {
  const clean = volumeName.replace(/[·|/\\:*?"<>]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `Tilana van Tonder - ${clean}.pdf`;
}
