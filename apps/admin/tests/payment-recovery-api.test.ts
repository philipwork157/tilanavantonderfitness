import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdminMutation: vi.fn(), requireAdmin: vi.fn(), runPaymentRecovery: vi.fn(),
  replayPaymentEvent: vi.fn(), requestPaymentRecovery: vi.fn(), getDatabase: vi.fn(),
}));
vi.mock('@server/utils/admin-mutation', () => ({ requireAdminMutation: mocks.requireAdminMutation }));
vi.mock('@server/utils/admin-auth', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@server/utils/database', () => ({ getDatabase: mocks.getDatabase }));
vi.mock('@server/services/payment-recovery', () => mocks);
let input: unknown;
vi.mock('@server/utils/route-validation', () => ({
  readZodBody: async (_event: unknown, schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw Object.assign(new Error('Invalid input'), { statusCode: 400 });
    return parsed.data;
  },
}));
let post: (event: never) => Promise<unknown>;
let get: (event: never) => Promise<unknown>;
let internal: (event: never) => Promise<unknown>;
const token = 'x'.repeat(40);
beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (handler: unknown) => handler);
  post = (await import('@server/api/admin/payments/recovery.post')).default;
  get = (await import('@server/api/admin/payments/recovery.get')).default;
  internal = (await import('@server/api/internal/payments/reconcile.post')).default;
});
beforeEach(() => {
  input = { action: 'reconcile', paymentId: 12 };
  mocks.requireAdminMutation.mockResolvedValue({ user: { id: 7 } });
  mocks.requireAdmin.mockResolvedValue({ user: { id: 7 } });
  mocks.runPaymentRecovery.mockResolvedValue({ processed: 1, retried: 0, alerts: { sent: 0, failed: 0 } });
  mocks.requestPaymentRecovery.mockResolvedValue({ queued: true });
  mocks.replayPaymentEvent.mockResolvedValue({ id: 9, processingStatus: 'processed' });
  mocks.getDatabase.mockReturnValue({ select: () => ({ from: () => ({
    orderBy: () => ({ limit: async () => [] }), where: () => ({ orderBy: () => ({ limit: async () => [] }) }),
  }) }) });
  vi.stubGlobal('setResponseStatus', vi.fn());
  vi.stubGlobal('setHeader', vi.fn());
  vi.stubGlobal('getHeader', () => `Bearer ${token}`);
  vi.stubGlobal('useRuntimeConfig', () => ({ paystackRecoveryEnabled: true, paystackRecoveryToken: token, paystackRecoveryAlertTo: 'ops@example.test' }));
  vi.stubGlobal('createError', (value: object) => Object.assign(new Error('Request denied'), value));
});

describe('operator and scheduler payment recovery routes', () => {
  it.each([401, 403])('rejects unauthorized or cross-origin mutations with %s before work', async (statusCode) => {
    mocks.requireAdminMutation.mockRejectedValueOnce(Object.assign(new Error('Denied'), { statusCode }));
    await expect(post({} as never)).rejects.toMatchObject({ statusCode });
    expect(mocks.requestPaymentRecovery).not.toHaveBeenCalled();
    expect(mocks.replayPaymentEvent).not.toHaveBeenCalled();
  });
  it('queues validated internal payment IDs with the acting administrator and HTTP 202', async () => {
    expect(await post({} as never)).toEqual({ queued: true });
    expect(mocks.requestPaymentRecovery).toHaveBeenCalledWith(12, 7);
    expect(setResponseStatus).toHaveBeenCalledWith({}, 202);
  });
  it('replays only a stored event ID', async () => {
    input = { action: 'replay', eventId: 6 };
    await post({} as never);
    expect(mocks.replayPaymentEvent).toHaveBeenCalledWith(6, 7);
  });
  it('acknowledges review without rewriting payment evidence', async () => {
    input = { action: 'acknowledge', paymentId: 12 };
    await post({} as never);
    expect(mocks.requestPaymentRecovery).toHaveBeenCalledWith(12, 7, 'acknowledge');
    expect(setResponseStatus).toHaveBeenCalledWith({}, 200);
  });
  it('rejects supplied provider payloads before reconciliation', async () => {
    input = { action: 'replay', eventId: 6, payload: { event: 'charge.success' } };
    await expect(post({} as never)).rejects.toMatchObject({ statusCode: 400 });
    expect(mocks.replayPaymentEvent).not.toHaveBeenCalled();
  });
  it('requires an admin session before reading recovery records', async () => {
    mocks.requireAdmin.mockRejectedValueOnce(Object.assign(new Error('Denied'), { statusCode: 401 }));
    await expect(get({} as never)).rejects.toMatchObject({ statusCode: 401 });
    expect(mocks.getDatabase).not.toHaveBeenCalled();
  });
  it('returns a no-store operator queue for an administrator', async () => {
    expect(await get({} as never)).toEqual({ jobs: [], events: [] });
    expect(setHeader).toHaveBeenCalledWith({}, 'cache-control', 'no-store');
  });
  it('denies scheduler requests without the dedicated bearer capability', async () => {
    vi.stubGlobal('getHeader', () => undefined);
    await expect(internal({} as never)).rejects.toMatchObject({ statusCode: 401 });
    expect(mocks.runPaymentRecovery).not.toHaveBeenCalled();
  });
  it('runs configured scheduler work without accepting provider payloads', async () => {
    expect(await internal({} as never)).toMatchObject({ processed: 1 });
    expect(mocks.runPaymentRecovery).toHaveBeenCalledOnce();
  });
  it('signals alert transport failure to the external scheduler', async () => {
    mocks.runPaymentRecovery.mockResolvedValueOnce({ alerts: { failed: 1 } });
    await expect(internal({} as never)).rejects.toMatchObject({ statusCode: 503 });
  });
});
