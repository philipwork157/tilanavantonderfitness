import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPurchaseProgramAttachments, PURCHASE_ATTACHMENT_MAX_BYTES } from '@server/services/purchase-program-attachments';

const mocks = vi.hoisted(() => ({ files: vi.fn(), read: vi.fn() }));
vi.mock('@server/utils/r2', () => ({ readProgramEmailAttachment: mocks.read }));
vi.mock('@server/utils/database', () => ({ getDatabase: () => ({ selectDistinct: () => {
  const query = { from: () => query, innerJoin: () => query, leftJoin: () => query, where: () => query, orderBy: mocks.files };
  return query;
} }) }));
const file = { id: 10, bucket: 'private-test', key: 'volume/file.pdf', filename: 'Beginner.pdf', name: 'Beginner', size: 20, sortOrder: 0 };
beforeEach(() => {
  vi.stubGlobal('useRuntimeConfig', () => ({ r2PrivateProgramBucket: 'private-test' }));
  mocks.files.mockResolvedValue([file]);
  mocks.read.mockResolvedValue(Buffer.from('%PDF-fixture'));
});
describe('bounded purchase attachments', () => {
  const signal = () => new AbortController().signal;
  it('loads every authorized PDF with the shared remaining budget', async () => {
    mocks.files.mockResolvedValue([file, { ...file, id: 11, filename: 'Intermediate.pdf', key: 'second.pdf' }]);
    const result = await getPurchaseProgramAttachments(1, 2, signal());
    expect(result).toHaveLength(2);
    expect(result?.[0]).toMatchObject({ filename: '10-Beginner.pdf', contentType: 'application/pdf' });
    expect(mocks.read.mock.calls[1]?.[2]).toBe(PURCHASE_ATTACHMENT_MAX_BYTES - Buffer.byteLength('%PDF-fixture'));
  });
  it('cancels when no current purchase grants remain', async () => {
    mocks.files.mockResolvedValue([]);
    expect(await getPurchaseProgramAttachments(1, 2, signal())).toBeNull();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('retries missing ready files rather than claiming delivery', async () => {
    mocks.files.mockResolvedValue([{ ...file, id: null }]);
    await expect(getPurchaseProgramAttachments(1, 2, signal())).rejects.toThrow('PDF is missing');
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('requires a configured environment bucket', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({}));
    await expect(getPurchaseProgramAttachments(1, 2, signal())).rejects.toThrow('not configured');
  });
  it('falls back before downloading an oversized basket', async () => {
    mocks.files.mockResolvedValue([{ ...file, size: PURCHASE_ATTACHMENT_MAX_BYTES + 1 }]);
    expect(await getPurchaseProgramAttachments(1, 2, signal())).toEqual([]);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('falls back when the actual stream exceeds the budget despite metadata', async () => {
    mocks.read.mockResolvedValue(null);
    expect(await getPurchaseProgramAttachments(1, 2, signal())).toEqual([]);
  });
  it('bounds file counts and propagates storage failures for retry', async () => {
    mocks.files.mockResolvedValue(Array.from({ length: 31 }, (_, id) => ({ ...file, id: id + 1 })));
    expect(await getPurchaseProgramAttachments(1, 2, signal())).toEqual([]);
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.files.mockResolvedValue([file]);
    mocks.read.mockRejectedValue(new Error('R2 unavailable'));
    await expect(getPurchaseProgramAttachments(1, 2, signal())).rejects.toThrow('R2 unavailable');
  });
  it('normalizes unsafe attachment names and honors cancellation', async () => {
    mocks.files.mockResolvedValue([{ ...file, filename: '../Header\r\nInjected.exe' }]);
    const result = await getPurchaseProgramAttachments(1, 2, signal());
    expect(result?.[0]?.filename).not.toMatch(/[\r\n/]/);
    expect(result?.[0]?.filename).toMatch(/\.pdf$/);
    await expect(getPurchaseProgramAttachments(1, 2, AbortSignal.abort())).rejects.toThrow();
  });
  it('rechecks purchase grants after reading storage and cancels a concurrent revocation', async () => {
    mocks.files.mockResolvedValueOnce([file]).mockResolvedValueOnce([]);
    expect(await getPurchaseProgramAttachments(1, 2, signal())).toBeNull();
    expect(mocks.read).toHaveBeenCalledOnce();
  });
  it('retries a concurrent file replacement rather than emailing a retired PDF', async () => {
    mocks.files.mockResolvedValueOnce([file]).mockResolvedValueOnce([{ ...file, id: 12 }]);
    await expect(getPurchaseProgramAttachments(1, 2, signal())).rejects.toThrow('changed');
  });
});
