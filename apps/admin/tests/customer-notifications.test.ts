import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clients } from '@tilana/db/schema';
import { deliverCustomerNotifications, deliverPurchaseNotification } from '@server/services/customer-notifications';
const mocks = vi.hoisted(() => ({ database: { select: vi.fn(), transaction: vi.fn(), update: vi.fn() }, attachments: vi.fn(), send: vi.fn(), generateLink: vi.fn(), assertEnvironment: vi.fn() }));
vi.mock('@server/utils/database', () => ({ getDatabase: () => mocks.database }));
vi.mock('@server/utils/paystack-configuration', () => ({ assertPaystackDatabaseEnvironment: mocks.assertEnvironment, getCustomerAccountBaseUrl: () => 'https://admin.example.test', getPaystackEnvironment: () => 'test' }));
vi.mock('@server/utils/supabase-admin', () => ({ getSupabaseAdminClient: () => ({ auth: { admin: { generateLink: mocks.generateLink } } }) }));
vi.mock('@server/services/customer-access-emails', () => ({ sendCustomerAccessEmail: mocks.send }));
vi.mock('@server/services/purchase-program-attachments', () => ({ getPurchaseProgramAttachments: mocks.attachments }));
let job: Record<string, unknown>;
let buyers: unknown[];
beforeEach(() => {
  job = { id: 1, orderId: 2, clientId: 3, kind: 'purchase', createdAt: new Date(), leaseVersion: 1, attempts: 0 };
  buyers = [{ email: 'buyer@example.test', firstName: 'Buyer' }];
  vi.stubGlobal('useRuntimeConfig', () => ({ customerNotificationsEnabled: true,
    emailDevelopmentEnabled: true, emailDevelopmentRecipient: 'safe@example.test' }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.database.select.mockImplementation(() => {
    let table: unknown;
    const query = { from: (value: unknown) => { table = value; return query; }, innerJoin: () => query, where: () => query,
      orderBy: () => query, limit: () => query, for: async () => [job],
      then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(table === clients ? buyers : [{ id: job.id }]).then(resolve) };
    return query;
  });
  mocks.database.update.mockImplementation(() => {
    const query = { set: () => query, where: () => query, returning: async () => [{ ...job, attempts: 1 }], then: (resolve: (value: unknown) => unknown) => Promise.resolve(undefined).then(resolve) };
    return query;
  });
  mocks.database.transaction.mockImplementation(callback => callback(mocks.database));
  mocks.attachments.mockResolvedValue([{ filename: 'Beginner.pdf', contentType: 'application/pdf', content: Buffer.from('%PDF-fixture') }]);
  mocks.send.mockResolvedValue({ messageId: 'fixture' });
  mocks.generateLink.mockResolvedValue({ data: { properties: { hashed_token: 'fixture-token' } }, error: null });
});
describe('purchase email outbox delivery', () => {
  it('passes only purchase attachments and a permanent recovery-page link', async () => {
    expect(await deliverCustomerNotifications(1)).toEqual({ sent: 1, failed: 0, canceled: 0 });
    expect(mocks.attachments).toHaveBeenCalledWith(2, 3, expect.any(AbortSignal));
    expect(mocks.send.mock.calls[0]?.[0]).toMatchObject({ instructionsOnly: true, signInUrl: 'https://admin.example.test/account/sign-in', attachments: [{ filename: 'Beginner.pdf' }] });
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });
  it('preserves one-time login delivery without attachments', async () => {
    job.kind = 'login';
    expect(await deliverCustomerNotifications(1)).toMatchObject({ sent: 1 });
    expect(mocks.attachments).not.toHaveBeenCalled();
    expect(mocks.send.mock.calls[0]?.[0].signInUrl).toContain('token_hash=fixture-token');
    expect(mocks.send.mock.calls[0]?.[0].attachments).toBeUndefined();
  });
  it('detects stale or blank development-inbox configuration before token generation', async () => {
    job.kind = 'login';
    vi.stubGlobal('useRuntimeConfig', () => ({ customerNotificationsEnabled: true, emailDevelopmentEnabled: true, emailDevelopmentRecipient: '' }));
    expect(await deliverCustomerNotifications(1)).toMatchObject({ failed: 1 });
    expect(mocks.generateLink).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('Customer email delivery failed.', { notificationId: 1, kind: 'login', failure: 'email-configuration' });
  });
  it('reports token failures using fixed categories without logging provider details', async () => {
    job.kind = 'login';
    mocks.generateLink.mockResolvedValueOnce({ data: {}, error: new Error('secret-token buyer@example.test') });
    expect(await deliverCustomerNotifications(1)).toMatchObject({ failed: 1 });
    expect(console.error).toHaveBeenCalledWith('Customer email delivery failed.', { notificationId: 1, kind: 'login', failure: 'magic-link' });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/secret-token|buyer@example/);
  });
  it.each(['missing buyer', 'revoked grant'])('cancels %s without sending content', async reason => {
    if (reason === 'missing buyer') buyers = [];
    else mocks.attachments.mockResolvedValue(null);
    expect(await deliverCustomerNotifications(1)).toMatchObject({ canceled: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('retains failed storage and SES work for retry', async () => {
    mocks.attachments.mockRejectedValueOnce(new Error('Storage down'));
    expect(await deliverCustomerNotifications(1)).toMatchObject({ failed: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
    mocks.send.mockRejectedValueOnce(new Error('SES down'));
    expect(await deliverCustomerNotifications(1)).toMatchObject({ failed: 1 });
  });
  it('does not run immediate delivery when disabled', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ customerNotificationsEnabled: false }));
    await deliverPurchaseNotification(2);
    expect(mocks.database.select).not.toHaveBeenCalled();
  });
  it('attempts immediate delivery without propagating queue outages into payment handling', async () => {
    await deliverPurchaseNotification(2);
    expect(mocks.send).toHaveBeenCalledOnce();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.database.select.mockImplementationOnce(() => { throw new Error('secret-provider-data'); });
    await expect(deliverPurchaseNotification(2)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith('Purchase email delivery requires attention.');
  });
  it('aborts timed-out PDF reads and never sends after a late storage response', async () => {
    vi.useFakeTimers();
    let resolve!: (value: unknown[]) => void;
    mocks.attachments.mockImplementationOnce(() => new Promise<unknown[]>(accept => { resolve = accept; }));
    try {
      const pending = deliverCustomerNotifications(1);
      await vi.advanceTimersByTimeAsync(30_001);
      expect(await pending).toMatchObject({ failed: 1 });
      expect(mocks.attachments.mock.calls[0]?.[2].aborted).toBe(true);
      resolve([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(mocks.send).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
});
