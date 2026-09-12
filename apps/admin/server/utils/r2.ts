import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let r2DownloadClient: S3Client | undefined;
let r2DownloadConfigurationKey = '';

export async function createSignedProgramDownload(bucket: string, objectKey: string): Promise<string> {
  const config = useRuntimeConfig();
  const accountId = String(config.r2AccountId || '').trim();
  const accessKeyId = String(config.r2DownloadAccessKeyId || '').trim();
  const secretAccessKey = String(config.r2DownloadSecretAccessKey || '').trim();
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw createError({ statusCode: 503, statusMessage: 'Program downloads are not configured.' });
  }

  const configurationKey = `${accountId}:${accessKeyId}`;
  if (!r2DownloadClient || r2DownloadConfigurationKey !== configurationKey) {
    r2DownloadClient = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
    r2DownloadConfigurationKey = configurationKey;
  }

  return getSignedUrl(r2DownloadClient, new GetObjectCommand({ Bucket: bucket, Key: objectKey }), { expiresIn: 300 });
}
