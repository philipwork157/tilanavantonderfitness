import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

const mocks = vi.hoisted(() => ({ requireCustomer: vi.fn(), getDatabase: vi.fn(), createSignedProgramDownload: vi.fn() }));
vi.mock('@server/utils/customer-auth', () => mocks);
vi.mock('@server/utils/database', () => mocks);
vi.mock('@server/utils/r2', () => ({ ...mocks, getCatalogueStorageConfiguration: () => ({ privateProgramBucket: 'private-test' }) }));
let list: (event: never) => Promise<unknown>;
let download: (event: never) => Promise<unknown>;
let rows: unknown[];
let predicate: SQL;
let fileId: string;

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler);
  list = (await import('@server/api/customer/programs.get')).default;
  download = (await import('@server/api/customer/files/[id].get')).default;
});
beforeEach(() => {
  rows = [];
  fileId = '11';
  mocks.requireCustomer.mockResolvedValue({ clientId: 7, firstName: 'Buyer', email: 'buyer@example.test' });
  mocks.createSignedProgramDownload.mockResolvedValue('https://private.example/signed');
  const query = { from: () => query, innerJoin: () => query, leftJoin: () => query,
    where: (condition: SQL) => { predicate = condition; return query; },
    orderBy: async () => rows, limit: async () => rows };
  mocks.getDatabase.mockReturnValue({ select: () => query });
  vi.stubGlobal('getRouterParam', () => fileId);
  vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) => Object.assign(new Error(input.statusMessage), input));
  vi.stubGlobal('sendRedirect', (_event: unknown, url: string, code: number) => ({ url, code }));
});

describe('customer program authorization and overlapping grants', () => {
  it('groups overlapping grants into one volume and deduplicates its files', async () => {
    rows = [
      { accessId: 1, volumeId: 20, programName: 'Strong', volumeName: 'Volume 1', fileId: 11, fileName: 'Program' },
      { accessId: 2, volumeId: 20, programName: 'Strong', volumeName: 'Volume 1', fileId: 11, fileName: 'Program' },
      { accessId: 2, volumeId: 20, programName: 'Strong', volumeName: 'Volume 1', fileId: 12, fileName: 'Guide' },
    ];
    expect(await list({} as never)).toMatchObject({ programs: [{ programName: 'Strong', files: [{ id: 11, name: 'Program' }, { id: 12, name: 'Guide' }] }] });
    expect((await list({} as never) as { programs: unknown[] }).programs).toHaveLength(1);
  });

  it.each(['list', 'download'])('%s enforces linked ownership, start time, status and exclusive expiry in SQL', async action => {
    if (action === 'download') rows = [{ bucket: 'private-test', objectKey: 'file.pdf', displayName: 'Program', originalFilename: null }];
    await (action === 'list' ? list : download)({} as never);
    const query = new PgDialect().sqlToQuery(predicate);
    expect(query.sql).toContain('"program_access"."client_id" =');
    expect(query.params).toContain(7);
    expect(query.sql).toContain('"program_access"."starts_at" <=');
    expect(query.sql).toContain('"program_access"."expires_at" >');
    expect(query.sql).toContain('"program_access"."status" =');
    expect(query.params).toContain('active');
    if (action === 'download') {
      expect(query.params).toContain('private-test');
      expect(query.params).toContain('ready');
      expect(query.params).toContain(11);
    }
  });

  it.each(['list', 'download'])('rejects unauthenticated %s before querying or signing', async action => {
    mocks.requireCustomer.mockRejectedValueOnce(Object.assign(new Error('Denied'), { statusCode: 401 }));
    await expect((action === 'list' ? list : download)({} as never)).rejects.toMatchObject({ statusCode: 401 });
    expect(mocks.getDatabase).not.toHaveBeenCalled();
    expect(mocks.createSignedProgramDownload).not.toHaveBeenCalled();
  });

  it('does not sign a missing or unauthorized file', async () => {
    await expect(download({} as never)).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.createSignedProgramDownload).not.toHaveBeenCalled();
  });

  it('rejects invalid file IDs before querying', async () => {
    fileId = 'invalid';
    await expect(download({} as never)).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });

  it('signs only the authorized bucket/object after entitlement checking', async () => {
    rows = [{ bucket: 'private-test', objectKey: 'volume/file.pdf', displayName: 'Program', originalFilename: 'Original.pdf' }];
    expect(await download({} as never)).toEqual({ url: 'https://private.example/signed', code: 302 });
    expect(mocks.createSignedProgramDownload).toHaveBeenCalledExactlyOnceWith('private-test', 'volume/file.pdf', 'Original.pdf');
  });
});
