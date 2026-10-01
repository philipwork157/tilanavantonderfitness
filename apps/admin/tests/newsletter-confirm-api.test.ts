import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ confirmNewsletterSubscription: vi.fn(), redirect: vi.fn() }));
vi.mock('@server/services/newsletter-subscriptions', () => mocks);
let handler: (event: never) => Promise<unknown>;
let token: unknown;
beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (value: unknown) => value);
  handler = (await import('@server/api/newsletter/confirm.get')).default;
});
beforeEach(() => {
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { siteUrl: 'https://website.example.test/' } }));
  vi.stubGlobal('getQuery', () => ({ token }));
  vi.stubGlobal('sendRedirect', mocks.redirect);
  vi.stubGlobal('createError', (input: { statusCode: number; statusMessage: string }) => Object.assign(new Error(input.statusMessage), input));
  token = 'a'.repeat(64);
});
describe('newsletter confirmation uses the public website origin', () => {
  it.each([true, false])('redirects confirmed=%s to the public page', async confirmed => {
    mocks.confirmNewsletterSubscription.mockResolvedValue(confirmed);
    await handler({} as never);
    expect(mocks.redirect).toHaveBeenCalledWith({}, `https://website.example.test/newsletter/confirmed?status=${confirmed ? 'success' : 'invalid'}`, 302);
  });
  it('rejects malformed tokens without confirming a subscription', async () => {
    token = '';
    await handler({} as never);
    expect(mocks.confirmNewsletterSubscription).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith({}, 'https://website.example.test/newsletter/confirmed?status=invalid', 302);
  });
  it('fails closed when the public URL is missing', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ public: { siteUrl: '' } }));
    await expect(handler({} as never)).rejects.toMatchObject({ statusCode: 503 });
    expect(mocks.confirmNewsletterSubscription).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it('does not claim success when subscription persistence fails', async () => {
    mocks.confirmNewsletterSubscription.mockRejectedValue(new Error('Database unavailable'));
    await expect(handler({} as never)).rejects.toThrow('Database unavailable');
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
