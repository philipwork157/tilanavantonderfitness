import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
  const config = useRuntimeConfig();
  const configuredBucket = String(config.r2PrivateProgramBucket || '').trim();
  if (!configuredBucket || bucket !== configuredBucket) {
    throw createError({ statusCode: 503, statusMessage: 'This program file is not available in this environment.' });
  }

  const credentials = readCredentials('download');
  const configurationKey = `${credentials.accountId}:${credentials.accessKeyId}:${credentials.secretAccessKey}`;
  if (!r2DownloadClient || r2DownloadConfigurationKey !== configurationKey) {
    r2DownloadClient = createClient(credentials);
    r2DownloadConfigurationKey = configurationKey;
  }

  const disposition = filename
    ? `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
    : undefined;
  return getSignedUrl(r2DownloadClient, new GetObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ResponseContentDisposition: disposition,
  }), { expiresIn: R2_DOWNLOAD_URL_TTL_SECONDS });
}
