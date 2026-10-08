import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Simulated R2: records what would be sent, never touches the network.
const sent: { name: string; input: Record<string, unknown> }[] = [];
const clientOptions: unknown[] = [];
vi.mock('@aws-sdk/client-s3', () => {
  class Command { constructor(readonly input: Record<string, unknown>) {} }
  class PutObjectCommand extends Command {}
  class GetObjectCommand extends Command {}
  class S3Client {
    constructor(options: unknown) { clientOptions.push(options); }
    async send(command: Command) {
      sent.push({ name: command.constructor.name, input: command.input });
      return command instanceof GetObjectCommand ? { Body: { transformToByteArray: async () => new Uint8Array([37, 80, 68, 70]) } } : {};
    }
  }
  return { S3Client, PutObjectCommand, GetObjectCommand };
});

const settings = {
  R2_ACCOUNT_ID: 'acc123',
  R2_PRIVATE_PROGRAM_BUCKET: 'tilanavantonder-dev-private-programs',
  R2_UPLOAD_ACCESS_KEY_ID: 'up-id',
  R2_UPLOAD_SECRET_ACCESS_KEY: 'up-secret',
  R2_DOWNLOAD_ACCESS_KEY_ID: 'down-id',
  R2_DOWNLOAD_SECRET_ACCESS_KEY: 'down-secret',
};

describe('program files in Cloudflare R2', () => {
  beforeEach(() => {
    vi.resetModules();
    sent.length = 0;
    clientOptions.length = 0;
    for (const [key, value] of Object.entries(settings)) vi.stubEnv(key, value);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('uploads with the write token and downloads with the read token', async () => {
    const { uploadProgramFile, downloadProgramFile } = await import('@/server/utils/program-files');
    const key = await uploadProgramFile(3, 1, 'abcdef0123456789', Buffer.from('%PDF-1.7 %%EOF'));
    expect(key).toBe('volumes/3/v1-abcdef012345.pdf');
    expect(sent[0]).toMatchObject({ name: 'PutObjectCommand', input: { Bucket: settings.R2_PRIVATE_PROGRAM_BUCKET, Key: key, ContentType: 'application/pdf' } });

    expect([...await downloadProgramFile(key)]).toEqual([37, 80, 68, 70]);
    expect(sent[1]).toMatchObject({ name: 'GetObjectCommand', input: { Bucket: settings.R2_PRIVATE_PROGRAM_BUCKET, Key: key } });
    expect(clientOptions).toMatchObject([
      { region: 'auto', endpoint: 'https://acc123.r2.cloudflarestorage.com', credentials: { accessKeyId: 'up-id' } },
      { credentials: { accessKeyId: 'down-id' } },
    ]);
  });

  it('refuses to work without its settings', async () => {
    vi.stubEnv('R2_DOWNLOAD_SECRET_ACCESS_KEY', '');
    const { downloadProgramFile } = await import('@/server/utils/program-files');
    await expect(downloadProgramFile('volumes/1/v1.pdf')).rejects.toThrow('not configured');
    expect(sent).toEqual([]);
  });
});
