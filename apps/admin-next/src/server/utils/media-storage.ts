import 'server-only';
import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { serverConfig } from '../config';
import { HttpError } from '../http';
import { logger } from '../logger';
import { r2Endpoint } from './program-files';

/**
 * Public pictures for the website in the public Cloudflare R2 bucket
 * (R2_PUBLIC_BUCKET, e.g. tilanavantonder-dev-public), served on its own
 * domain (R2_PUBLIC_URL, e.g. https://media-dev.tilanavantonder.co.za):
 *
 *   blog/<post id>/<uuid>.webp               blog covers
 *   kitchen/<recipe id>/<uuid>.webp          recipe photos
 *   email/blog/<post id>/<uuid>.jpg          cover copies for emails
 *   program-previews/<program id>/v<n>-.../  "Peek inside" pages
 *
 * Program PDFs never go here: they stay in the private bucket (program-files.ts).
 * The database stores each picture's path; the public address is worked out
 * from it.
 */

/** File names are never reused (a new picture gets a new name), so browsers may keep them for a year. */
const CACHE_FOREVER = 'public, max-age=31536000, immutable';

let cached: { client: S3Client; bucket: string; key: string } | undefined;

function settings() {
  const config = serverConfig();
  return {
    accountId: config.r2AccountId,
    bucket: config.r2PublicBucket,
    keyId: config.r2PublicAccessKeyId,
    secret: config.r2PublicSecretAccessKey,
    publicUrl: config.r2PublicUrl.trim().replace(/\/+$/, ''),
  };
}

function media(): { client: S3Client; bucket: string } {
  const { accountId, bucket, keyId, secret } = settings();
  if (!accountId || !bucket || !keyId || !secret) {
    throw new HttpError(503, 'Image storage (Cloudflare R2) is not configured yet.');
  }
  const key = `${accountId}\n${bucket}\n${keyId}`;
  if (cached?.key !== key) {
    cached = {
      key,
      bucket,
      client: new S3Client({ region: 'auto', endpoint: r2Endpoint(accountId), credentials: { accessKeyId: keyId, secretAccessKey: secret } }),
    };
  }
  return cached;
}

/** The public address of a stored picture, or null when there is none (or the media address is not set). */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const { publicUrl } = settings();
  if (!publicUrl) return null;
  return `${publicUrl}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** Stores a picture under `path`. Throws a friendly 502 when R2 refuses it. */
export async function putMedia(path: string, data: Buffer, contentType: 'image/webp' | 'image/jpeg'): Promise<void> {
  const { client, bucket } = media();
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: path,
      Body: data,
      ContentType: contentType,
      ContentLength: data.length,
      CacheControl: CACHE_FOREVER,
    }));
  }
  catch (error) {
    logger.error({ err: error, path }, 'R2 media upload failed');
    throw new HttpError(502, 'The image could not be stored. Please try again.');
  }
}

/** Reads a stored picture, or null when it does not exist. */
export async function getMedia(path: string): Promise<Buffer | null> {
  const { client, bucket } = media();
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: path }));
    return result.Body ? Buffer.from(await result.Body.transformToByteArray()) : null;
  }
  catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** Whether a picture exists. */
export async function hasMedia(path: string): Promise<boolean> {
  const { client, bucket } = media();
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: path }));
    return true;
  }
  catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

/** Best effort: a leftover picture is harmless, so failures are only logged. */
export async function deleteMedia(paths: (string | null | undefined)[]): Promise<void> {
  const keys = paths.filter((path): path is string => Boolean(path));
  if (!keys.length) return;
  try {
    const { client, bucket } = media();
    // DeleteObjects takes at most 1000 keys per call.
    for (let start = 0; start < keys.length; start += 1000) {
      const chunk = keys.slice(start, start + 1000);
      const result = await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: chunk.map(Key => ({ Key })), Quiet: true } }));
      if (result.Errors?.length) logger.warn({ count: result.Errors.length, reason: result.Errors[0]?.Message }, 'Some images could not be deleted');
    }
  }
  catch (error) {
    logger.warn({ err: error, count: keys.length }, 'Could not delete images');
  }
}

function isNotFound(error: unknown): boolean {
  const { name, $metadata } = (error ?? {}) as { name?: string; $metadata?: { httpStatusCode?: number } };
  return name === 'NoSuchKey' || name === 'NotFound' || $metadata?.httpStatusCode === 404;
}
