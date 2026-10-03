import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readProgramEmailAttachment } from '@server/utils/r2';
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@aws-sdk/client-s3', () => ({ S3Client: class { send = mocks.send; }, GetObjectCommand: class { constructor(public input: unknown) {} }, HeadObjectCommand: vi.fn(), PutObjectCommand: vi.fn() }));
beforeEach(() => {
  vi.stubGlobal('useRuntimeConfig', () => ({ r2PrivateProgramBucket: 'private-test', r2AccountId: 'fixture', r2DownloadAccessKeyId: 'fixture', r2DownloadSecretAccessKey: 'fixture' }));
  vi.stubGlobal('createError', (input: { statusMessage: string }) => new Error(input.statusMessage));
});
describe('private PDF attachment streams', () => {
  function response(bytes: string, contentType = 'application/pdf', length?: number) {
    const Body = Readable.from([Buffer.from(bytes)]);
    mocks.send.mockResolvedValue({ Body, ContentType: contentType, ContentLength: length });
    return Body;
  }
  it('reads PDF bytes using a bounded read-only command and cancellation signal', async () => {
    response('%PDF-fixture');
    const signal = new AbortController().signal;
    expect(Buffer.from((await readProgramEmailAttachment('private-test', 'file.pdf', 100, signal))!).toString()).toBe('%PDF-fixture');
    expect(mocks.send.mock.calls[0]?.[0].input).toEqual({ Bucket: 'private-test', Key: 'file.pdf' });
    expect(mocks.send.mock.calls[0]?.[1]).toEqual({ abortSignal: signal });
  });
  it('rejects another environment before any storage request', async () => {
    await expect(readProgramEmailAttachment('private-live', 'file.pdf', 100, new AbortController().signal)).rejects.toThrow('not available');
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it.each([true, false])('destroys oversized streams with metadata=%s', async metadata => {
    const body = response('%PDF-fixture', 'application/pdf', metadata ? 100 : undefined);
    expect(await readProgramEmailAttachment('private-test', 'file.pdf', 5, new AbortController().signal)).toBeNull();
    expect(body.destroyed).toBe(true);
  });
  it.each([['not-pdf', 'application/pdf'], ['%PDF-fixture', 'text/html']])('rejects invalid content %s/%s', async (bytes, mime) => {
    response(bytes, mime);
    await expect(readProgramEmailAttachment('private-test', 'file.pdf', 100, new AbortController().signal)).rejects.toThrow();
  });
  it('propagates missing objects and honors pre-aborted delivery', async () => {
    mocks.send.mockRejectedValue(new Error('Object missing'));
    await expect(readProgramEmailAttachment('private-test', 'file.pdf', 100, new AbortController().signal)).rejects.toThrow('Object missing');
    mocks.send.mockClear();
    await expect(readProgramEmailAttachment('private-test', 'file.pdf', 100, AbortSignal.abort())).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
