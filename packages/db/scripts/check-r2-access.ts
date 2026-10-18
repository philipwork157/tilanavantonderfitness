/**
 * Checks what each R2 key may do on each bucket, for development and live.
 * Prints only bucket names, key names and yes/no; never a key or secret.
 *
 *   pnpm --filter @tilana/db exec tsx scripts/check-r2-access.ts
 *
 * "write" puts a tiny .access-check file and deletes it again.
 */
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { DeleteObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

type Env = Record<string, string | undefined>;
const load = (file: string): Env | null => {
  const path = `../../apps/admin-next/${file}`;
  return existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : null;
};

async function attempt(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
    return 'yes';
  }
  catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    return `NO (${status ?? (error as Error).name})`;
  }
}

async function check(label: string, env: Env, keyName: string, bucketName: string, write: boolean) {
  const keyId = env[`${keyName}_ACCESS_KEY_ID`];
  const secret = env[`${keyName}_SECRET_ACCESS_KEY`];
  const bucket = env[bucketName];
  if (!keyId || !secret || !bucket || !env.R2_ACCOUNT_ID) {
    console.log(`  ${label.padEnd(8)} ${keyName.padEnd(13)} on ${String(bucket ?? bucketName).padEnd(30)} not set`);
    return;
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: keyId, secretAccessKey: secret },
  });
  const read = await attempt(() => client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 })));
  let canWrite = '-';
  if (write) {
    const Key = '.access-check';
    canWrite = await attempt(async () => {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key, Body: 'ok', ContentType: 'text/plain' }));
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key }));
    });
  }
  console.log(`  ${label.padEnd(8)} ${keyName.padEnd(13)} on ${bucket.padEnd(30)} read: ${read.padEnd(10)} write: ${canWrite}`);
}

for (const [label, file] of [['dev', '.env.local'], ['live', '.env.prod']] as const) {
  const env = load(file);
  if (!env) {
    console.log(`${label}: apps/admin-next/${file} not found`);
    continue;
  }
  console.log(`${label} (${file})`);
  await check(label, env, 'R2_PUBLIC', 'R2_PUBLIC_BUCKET', true);
  await check(label, env, 'R2_UPLOAD', 'R2_PRIVATE_PROGRAM_BUCKET', true);
  await check(label, env, 'R2_DOWNLOAD', 'R2_PRIVATE_PROGRAM_BUCKET', false);
}
console.log('\nNeeded: R2_PUBLIC read+write on the public bucket, R2_UPLOAD read+write on the private bucket, R2_DOWNLOAD read on the private bucket.');
