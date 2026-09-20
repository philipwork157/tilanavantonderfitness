import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { H3Event } from 'h3';
import { createSupabaseAuthClient } from '@server/utils/supabase-auth';

const mocks = vi.hoisted(() => ({ create: vi.fn(), setCookie: vi.fn(), setHeader: vi.fn(), cookies: vi.fn(), url: vi.fn() }));
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.create }));
vi.mock('h3', () => ({ setCookie: mocks.setCookie, setResponseHeader: mocks.setHeader, parseCookies: mocks.cookies, getRequestURL: mocks.url }));

/** Request-local caching must preserve callbacks without leaking sessions between visitors. */
describe('Supabase request session', () => {
  beforeEach(() => {
    vi.stubGlobal('useRuntimeConfig', () => ({ supabaseUrl: 'https://auth.example.test', supabasePublishableKey: 'fixture' }));
    vi.stubGlobal('createError', (input: object) => Object.assign(new Error('Not configured'), input));
    mocks.create.mockImplementation(() => ({ auth: { session: null } }));
    mocks.cookies.mockReturnValue({ existing: 'fixture-cookie' });
    mocks.url.mockReturnValue(new URL('https://admin.example.test/api/customer/auth/confirm'));
  });
  it('reuses the client after OTP verification within one callback', () => {
    const event = { context: {} } as H3Event;
    const verified = createSupabaseAuthClient(event);
    expect(createSupabaseAuthClient(event)).toBe(verified);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it('never reuses an auth client across requests', () => {
    expect(createSupabaseAuthClient({ context: {} } as H3Event)).not.toBe(createSupabaseAuthClient({ context: {} } as H3Event));
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });
  it('retains secure HttpOnly response cookies and supplied cache headers', () => {
    const event = { context: {} } as H3Event;
    createSupabaseAuthClient(event);
    const options = mocks.create.mock.lastCall![2];
    expect(options.cookies.getAll()).toEqual([{ name: 'existing', value: 'fixture-cookie' }]);
    options.cookies.setAll([{ name: 'session', value: 'synthetic', options: { httpOnly: false, secure: false } }], { 'cache-control': 'private, no-store' });
    expect(mocks.setCookie).toHaveBeenCalledWith(event, 'session', 'synthetic', expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax' }));
    expect(mocks.setHeader).toHaveBeenCalledWith(event, 'cache-control', 'private, no-store');
  });
  it('fails closed without auth configuration', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({}));
    expect(() => createSupabaseAuthClient({ context: {} } as H3Event)).toThrow();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
