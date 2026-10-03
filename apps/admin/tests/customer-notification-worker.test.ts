import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ enabled: vi.fn(), run: vi.fn() }));
vi.mock('@server/services/customer-notifications', () => ({ runCustomerNotificationWorker: mocks.run }));
vi.mock('@server/utils/customer-delivery-configuration', () => ({ isLocalCustomerWorkerEnabled: mocks.enabled }));
let plugin: (nitro: { hooks: { hook: (name: string, close: () => void) => void } }) => void;
beforeAll(async () => {
  vi.stubGlobal('defineNitroPlugin', (handler: unknown) => handler);
  plugin = (await import('@server/plugins/customer-notifications')).default;
});
beforeEach(() => { mocks.enabled.mockReturnValue(true); mocks.run.mockResolvedValue({ sent: 0 }); });
describe('local outbox retry worker', () => {
  it('does not install a worker when disabled or deployed', () => {
    mocks.enabled.mockReturnValue(false); const hook = vi.fn(); plugin({ hooks: { hook } });
    expect(hook).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled();
  });
  it('retries once a minute, prevents overlaps, and stops when Nitro closes', async () => {
    vi.useFakeTimers(); let close!: () => void;
    try {
      let finish!: () => void;
      mocks.run.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
      plugin({ hooks: { hook: (name, callback) => { expect(name).toBe('close'); close = callback; } } });
      await vi.advanceTimersByTimeAsync(120_000); expect(mocks.run).toHaveBeenCalledOnce();
      finish(); await vi.advanceTimersByTimeAsync(60_000); expect(mocks.run).toHaveBeenCalledTimes(2);
      close(); await vi.advanceTimersByTimeAsync(60_000); expect(mocks.run).toHaveBeenCalledTimes(2);
    } finally { close?.(); vi.useRealTimers(); }
  });
  it('retains the timer after a transient failure and logs no provider/customer details', async () => {
    vi.useFakeTimers(); let close!: () => void;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mocks.run.mockRejectedValueOnce(new Error('private-provider-information'));
      plugin({ hooks: { hook: (_name, callback) => { close = callback; } } });
      await vi.advanceTimersByTimeAsync(120_000); expect(mocks.run).toHaveBeenCalledTimes(2);
      expect(console.error).toHaveBeenCalledWith('Local customer email retry failed. The queued work is retained.');
    } finally { close?.(); vi.useRealTimers(); }
  });
});
