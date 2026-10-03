import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ admin: vi.fn(), mutation: vi.fn(), finalize: vi.fn(), list: vi.fn(), options: vi.fn() }));
vi.mock('@server/utils/admin-auth', () => ({ requireAdmin: mocks.admin }));
vi.mock('@server/utils/admin-catalogue-request', () => ({ requireAdminCatalogueMutation: mocks.mutation }));
vi.mock('@server/services/program-storage', () => ({ finalizeProgramFileUpload: mocks.finalize }));
vi.mock('@server/utils/catalogue-route', () => ({ throwCatalogueRouteError: (error: unknown) => { throw error; } }));
vi.mock('@server/services/client-management', () => ({ listClientsWithProgrammes: mocks.list, listManualProgramVolumeOptions: mocks.options }));
let finalize: (event: never) => Promise<unknown>;
let list: (event: never) => Promise<unknown>;
beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (value: unknown) => value);
  finalize = (await import('@server/api/admin/program-files/[id]/finalize.post')).default;
  list = (await import('@server/api/admin/clients.get')).default;
});
beforeEach(() => {
  vi.stubGlobal('useRuntimeConfig', () => ({ paystackEnvironment: 'test' }));
  vi.stubGlobal('getRouterParam', () => '42'); vi.stubGlobal('getQuery', () => ({}));
  vi.stubGlobal('readBody', async () => ({ replaceCurrentEdition: true }));
  vi.stubGlobal('createError', (value: object) => Object.assign(new Error('Request rejected'), value));
  mocks.mutation.mockResolvedValue({ user: { id: 7 } }); mocks.admin.mockResolvedValue({ user: { id: 7 } });
  mocks.finalize.mockResolvedValue({ id: 42 }); mocks.list.mockResolvedValue([]); mocks.options.mockResolvedValue([]);
});
describe('V1 administrator HTTP boundaries', () => {
  it.each([401, 403])('protects new edition uploads behind admin/origin guards (%s)', async statusCode => {
    mocks.mutation.mockRejectedValueOnce({ statusCode });
    await expect(finalize({} as never)).rejects.toMatchObject({ statusCode }); expect(mocks.finalize).not.toHaveBeenCalled();
  });
  it('validates and forwards edition replacement with the authenticated actor', async () => {
    await finalize({} as never); expect(mocks.finalize).toHaveBeenCalledWith(42, 7, undefined, true);
    vi.stubGlobal('readBody', async () => ({ replaceCurrentEdition: true, replaceFileId: 1 }));
    await expect(finalize({} as never)).rejects.toMatchObject({ statusCode: 400 }); expect(mocks.finalize).toHaveBeenCalledOnce();
  });
  it('requires administrator access before exposing payment/client records', async () => {
    mocks.admin.mockRejectedValueOnce({ statusCode: 403 });
    await expect(list({} as never)).rejects.toMatchObject({ statusCode: 403 }); expect(mocks.list).not.toHaveBeenCalled();
  });
  it('rejects an invalid configured payment environment instead of guessing test mode', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ paystackEnvironment: 'unknown' }));
    await expect(list({} as never)).rejects.toMatchObject({ statusCode: 503 }); expect(mocks.list).not.toHaveBeenCalled();
  });
  it('defaults to Paystack, allows explicit legacy records, and rejects invalid source values', async () => {
    await list({} as never); expect(mocks.list).toHaveBeenLastCalledWith('test', 'paystack');
    vi.stubGlobal('getQuery', () => ({ source: 'all' })); await list({} as never); expect(mocks.list).toHaveBeenLastCalledWith('test', 'all');
    vi.stubGlobal('getQuery', () => ({ source: 'unknown' }));
    await expect(list({} as never)).rejects.toMatchObject({ statusCode: 400 }); expect(mocks.list).toHaveBeenCalledTimes(2);
  });
});
