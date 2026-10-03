import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'node:stream';
import { InvalidProgramPdfError } from './program-pdf';

let r2DownloadClient: S3Client | undefined;
let r2DownloadConfigurationKey = '';
let r2UploadClient: S3Client | undefined;
let r2UploadConfigurationKey = '';

export const R2_UPLOAD_URL_TTL_SECONDS = 10 * 60;
export const R2_DOWNLOAD_URL_TTL_SECONDS = 5 * 60;

interface R2Credentials {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function readCredentials(kind: 'download' | 'upload'): R2Credentials {
  const config = useRuntimeConfig();
  const accountId = String(config.r2AccountId || '').trim();
  const accessKeyId = String(
    kind === 'download' ? config.r2DownloadAccessKeyId : config.r2UploadAccessKeyId,
  ).trim();
  const secretAccessKey = String(
    kind === 'download' ? config.r2DownloadSecretAccessKey : config.r2UploadSecretAccessKey,
  ).trim();

  if (!accountId || !accessKeyId || !secretAccessKey) {
    const capability = kind === 'download' ? 'Program downloads' : 'Program uploads';
    throw createError({ statusCode: 503, statusMessage: `${capability} are not configured.` });
  }

  return { accountId, accessKeyId, secretAccessKey };
}

function createClient(credentials: R2Credentials): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${credentials.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
  });
}

function getUploadClient(): S3Client {
  const credentials = readCredentials('upload');
  const configurationKey = `${credentials.accountId}:${credentials.accessKeyId}:${credentials.secretAccessKey}`;
  if (!r2UploadClient || r2UploadConfigurationKey !== configurationKey) {
    r2UploadClient = createClient(credentials);
    r2UploadConfigurationKey = configurationKey;
  }
  return r2UploadClient;
}

/** Environment-scoped read-only storage for downloads and purchase attachments. */
function getProgramDownloadClient(bucket: string): S3Client {
  const configuredBucket = String(useRuntimeConfig().r2PrivateProgramBucket || '').trim();
  if (!configuredBucket || bucket !== configuredBucket) {
    throw createError({ statusCode: 503, statusMessage: 'This program file is not available in this environment.' });
  }
  const credentials = readCredentials('download');
  const configurationKey = `${credentials.accountId}:${credentials.accessKeyId}:${credentials.secretAccessKey}`;
  if (!r2DownloadClient || r2DownloadConfigurationKey !== configurationKey) {
    r2DownloadClient = createClient(credentials);
    r2DownloadConfigurationKey = configurationKey;
  }
  return r2DownloadClient;
}

/** Read a bounded private PDF without exposing an object URL or buffering an unbounded stream. */
export async function readProgramEmailAttachment(bucket: string, objectKey: string, maxBytes: number, signal: AbortSignal, etag?: string | null): Promise<Uint8Array | null> {
  return readPrivatePdf(getProgramDownloadClient(bucket), bucket, objectKey, maxBytes, signal, etag);
}

/** Upload verification uses the write credential, but still reads only the current private bucket. */
export async function readUploadedProgramPdf(bucket: string, objectKey: string, maxBytes: number, signal: AbortSignal, etag: string): Promise<Uint8Array | null> {
  if (bucket !== String(useRuntimeConfig().r2PrivateProgramBucket || '').trim()) {
    throw new Error('The PDF upload belongs to another environment.');
  }
  return readPrivatePdf(getUploadClient(), bucket, objectKey, maxBytes, signal, etag);
}

/** Bound both advertised and streamed bytes; conditional reads reject a changed object. */
async function readPrivatePdf(client: S3Client, bucket: string, objectKey: string, maxBytes: number, signal: AbortSignal, etag?: string | null): Promise<Uint8Array | null> {
  signal.throwIfAborted();
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey,
    ...(etag && { IfMatch: `"${etag.replaceAll('"', '')}"` }),
  }), { abortSignal: signal });
  if (!response.Body) throw new Error('Program PDF body is missing.');
  const body = response.Body;
  if (!(body instanceof Readable)) throw new Error('Program storage requires a server stream.');
  if (response.ContentType?.split(';')[0]?.trim() !== 'application/pdf') {
    body.destroy();
    throw new Error('Program attachment must be a PDF.');
  }
  if ((response.ContentLength ?? 0) > maxBytes) { body.destroy(); return null; }
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    for await (const chunk of body) {
      signal.throwIfAborted();
      const bytes = Buffer.from(chunk);
      length += bytes.length;
      if (length > maxBytes) return null;
      chunks.push(bytes);
    }
  } finally { body.destroy(); }
  const content = Buffer.concat(chunks);
  if (content.subarray(0, 5).toString() !== '%PDF-') throw new InvalidProgramPdfError();
  return content;
}

export function ensureCatalogueUploadConfigured(): void {
  getUploadClient();
}

export function getCatalogueStorageConfiguration() {
  const config = useRuntimeConfig();
  const publicMediaBucket = String(config.r2PublicMediaBucket || '').trim();
  const publicMediaBaseUrl = String(config.r2PublicMediaBaseUrl || '').trim().replace(/\/+$/, '');
  const privateProgramBucket = String(config.r2PrivateProgramBucket || '').trim();

  if (!publicMediaBucket || !publicMediaBaseUrl || !privateProgramBucket) {
    throw createError({ statusCode: 503, statusMessage: 'Program storage is not configured.' });
  }
  if (!/^https:\/\//.test(publicMediaBaseUrl)) {
    throw createError({ statusCode: 503, statusMessage: 'The public program media URL is invalid.' });
  }

  return { publicMediaBucket, publicMediaBaseUrl, privateProgramBucket };
}

export async function createSignedCatalogueUpload(
  bucket: string,
  objectKey: string,
  contentType: string,
): Promise<string> {
  const client = getUploadClient();
  return getSignedUrl(client, new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: contentType,
  }), { expiresIn: R2_UPLOAD_URL_TTL_SECONDS });
}

export async function inspectCatalogueObject(bucket: string, objectKey: string) {
  const response = await getUploadClient().send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
  return {
    contentType: response.ContentType,
    sizeBytes: response.ContentLength,
    etag: response.ETag,
  };
}

export async function createSignedProgramDownload(
  bucket: string,
  objectKey: string,
  filename?: string,
): Promise<string> {
  const client = getProgramDownloadClient(bucket);

  const disposition = filename
    ? `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
    : undefined;
  return getSignedUrl(client, new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ResponseContentDisposition: disposition,
  }), { expiresIn: R2_DOWNLOAD_URL_TTL_SECONDS });
}
