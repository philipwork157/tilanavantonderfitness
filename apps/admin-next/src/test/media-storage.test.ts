import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Simulated R2: records what would be sent and keeps the files in memory.
const sent: { name: string; input: Record<string, unknown> }[] = [];
const files = new Map<string, Buffer>();
vi.mock('@aws-sdk/client-s3', () => {
  class Command { constructor(readonly input: Record<string, unknown>) {} }
  class PutObjectCommand extends Command {}
  class GetObjectCommand extends Command {}
  class HeadObjectCommand extends Command {}
  class DeleteObjectsCommand extends Command {}
  const notFound = () => Object.assign(new Error('missing'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
  class S3Client {
    async send(command: Command) {
      sent.push({ name: command.constructor.name, input: command.input });
      const key = command.input.Key as string;
      if (command instanceof PutObjectCommand) files.set(key, command.input.Body as Buffer);
      if (command instanceof HeadObjectCommand && !files.has(key)) throw notFound();
      if (command instanceof GetObjectCommand) {
        const data = files.get(key);
        if (!data) throw notFound();
        return { Body: { transformToByteArray: async () => new Uint8Array(data) } };
      }
      if (command instanceof DeleteObjectsCommand) {
        for (const { Key } of (command.input.Delete as { Objects: { Key: string }[] }).Objects) files.delete(Key);
      }
      return {};
    }
  }
  return { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectsCommand };
});

// The email copy is made with sharp; a stand-in keeps this test fast.
vi.mock('@/server/utils/image-processing', () => ({ emailImageFromCover: async () => Buffer.from('jpeg') }));

const settings = {
  R2_ACCOUNT_ID: 'acc123',
  R2_PUBLIC_BUCKET: 'tilanavantonder-dev-public',
  R2_PUBLIC_URL: 'https://media-dev.tilanavantonder.co.za/',
  R2_PUBLIC_ACCESS_KEY_ID: 'public-id',
  R2_PUBLIC_SECRET_ACCESS_KEY: 'public-secret',
};

describe('website pictures in the public R2 bucket', () => {
  beforeEach(() => {
    vi.resetModules();
    sent.length = 0;
    files.clear();
    for (const [key, value] of Object.entries(settings)) vi.stubEnv(key, value);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('gives each stored path its public address on the media domain', async () => {
    const { mediaUrl } = await import('@/server/utils/media-storage');
    expect(mediaUrl('posts/12/a b.webp')).toBe('https://media-dev.tilanavantonder.co.za/posts/12/a%20b.webp');
    expect(mediaUrl(null)).toBeNull();
    vi.stubEnv('R2_PUBLIC_URL', '');
    expect(mediaUrl('posts/12/a.webp')).toBeNull();
  });

  it('stores a blog cover as a year-long cacheable WebP, makes its email JPEG once, and deletes both', async () => {
    const { uploadBlogImage, ensureEmailImage, deleteBlogImage } = await import('@/server/utils/blog-images');
    const path = await uploadBlogImage(12, { data: Buffer.from('webp'), width: 1600, height: 1000 } as never);
    expect(path).toMatch(/^blog\/12\/[0-9a-f-]{36}\.webp$/);
    expect(sent[0]).toMatchObject({
      name: 'PutObjectCommand',
      input: { Bucket: 'tilanavantonder-dev-public', Key: path, ContentType: 'image/webp', CacheControl: 'public, max-age=31536000, immutable' },
    });

    const emailUrl = await ensureEmailImage(path);
    const emailPath = `email/${path.replace('.webp', '.jpg')}`;
    expect(emailUrl).toBe(`https://media-dev.tilanavantonder.co.za/${emailPath}`);
    expect(files.get(emailPath)?.toString()).toBe('jpeg');
    sent.length = 0;
    await ensureEmailImage(path);
    expect(sent.map(command => command.name)).toEqual(['HeadObjectCommand']);

    await deleteBlogImage(path);
    expect(files.size).toBe(0);
  });

  it('refuses uploads without its settings, but still works out addresses', async () => {
    vi.stubEnv('R2_PUBLIC_SECRET_ACCESS_KEY', '');
    const { putMedia, mediaUrl } = await import('@/server/utils/media-storage');
    await expect(putMedia('posts/1/a.webp', Buffer.from('x'), 'image/webp')).rejects.toThrow('not configured');
    expect(mediaUrl('posts/1/a.webp')).toBe('https://media-dev.tilanavantonder.co.za/posts/1/a.webp');
    expect(sent).toEqual([]);
  });
});
