import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTrustedRequestIp } from '@server/utils/request-identity';
import type { H3Event } from 'h3';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

function event(headers: Record<string, string>, remoteAddress = '127.0.0.1') {
  return { node: { req: { headers, socket: { remoteAddress } } } } as unknown as H3Event;
}

/** Models Nitro's readable/writable Unix socket without network addresses. */
function localSocketEvent(headers: Record<string, string> = {}) {
  const request = event(headers, '');
  Object.assign(request.node.req.socket, { readable: true, writable: true, address: () => ({}) });
  return request;
}

beforeEach(() => {
  vi.stubGlobal('getHeader', (input: ReturnType<typeof event>, name: string) => input.node.req.headers[name]);
  vi.stubGlobal('getRequestIP', (input: ReturnType<typeof event>) => input.node.req.socket.remoteAddress);
  vi.stubGlobal('createError', (input: object) => Object.assign(new Error('denied'), input));
});

describe('trusted ingress identity', () => {
  // Read the committed example and actual Nuxt defaults, not a duplicate fixture.
  it.each(['development', 'production'])('keeps the copied example safe in %s', async mode => {
    const example = parseEnv(readFileSync(new URL('../.env.example', import.meta.url), 'utf8'));
    expect(example.NUXT_TRUSTED_CLIENT_IP_HEADER).toBeUndefined();
    vi.stubEnv('NODE_ENV', mode);
    vi.stubGlobal('defineNuxtConfig', (config: unknown) => config);
    vi.resetModules();
    const { default: config } = await import('../nuxt.config');
    expect(example.NUXT_ACCOUNT_BASE_URL).toBe('http://localhost:3001');
    expect(example.NUXT_PUBLIC_SITE_URL).toBe('http://localhost:4321');
    expect(config.runtimeConfig?.accountBaseUrl).toBe('http://localhost:3001');
    expect(config.runtimeConfig?.public?.siteUrl).toBe('http://localhost:4321');
    vi.stubGlobal('useRuntimeConfig', () => config.runtimeConfig);
    const request = event({ 'x-forwarded-for': '203.0.113.7' });
    if (mode === 'development') {
      expect(config.runtimeConfig?.trustedClientIpHeader).toBe('');
      expect(getTrustedRequestIp(request)).toBe('127.0.0.1');
    } else {
      expect(config.runtimeConfig?.trustedClientIpHeader).toBe('fly-client-ip');
      expect(() => getTrustedRequestIp(request)).toThrow(expect.objectContaining({ statusCode: 403 }));
    }
  });

  it('keeps both local dev servers on localhost without exposing a TCP worker', () => {
    const admin = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const web = JSON.parse(readFileSync(new URL('../../web/package.json', import.meta.url), 'utf8'));
    expect(admin.scripts.dev).not.toContain('NITRO_NO_UNIX_SOCKET');
    expect(admin.scripts.dev).toContain('--host localhost --port 3001');
    expect(web.scripts.dev).toContain('--host localhost --port 4321');
    expect(web.scripts.start).toContain('--host localhost --port 4321');
  });

  it('uses a shared loopback identity for the local Nuxt Unix socket, ignoring spoofed headers', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('FLY_APP_NAME', '');
    vi.stubGlobal('useRuntimeConfig', () => ({ trustedClientIpHeader: '' }));
    expect(getTrustedRequestIp(localSocketEvent({
      'x-forwarded-for': '203.0.113.7', 'fly-client-ip': '203.0.113.9',
    }))).toBe('127.0.0.1');
  });

  it.each(['production', 'test', ''])('does not accept an addressless socket in %s mode', mode => {
    vi.stubEnv('NODE_ENV', mode);
    vi.stubEnv('FLY_APP_NAME', '');
    vi.stubGlobal('useRuntimeConfig', () => ({ trustedClientIpHeader: '' }));
    expect(() => getTrustedRequestIp(localSocketEvent())).toThrow(expect.objectContaining({ statusCode: 403 }));
  });

  it.each(['tilanavantonder-admin-dev', 'tilanavantonder-admin-prod'])('does not use the local fallback on Fly app %s', app => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('FLY_APP_NAME', app);
    vi.stubGlobal('useRuntimeConfig', () => ({ trustedClientIpHeader: '' }));
    expect(() => getTrustedRequestIp(localSocketEvent())).toThrow(expect.objectContaining({ statusCode: 403 }));
  });

  it('still requires the configured proxy identity in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('FLY_APP_NAME', '');
    vi.stubGlobal('useRuntimeConfig', () => ({ trustedClientIpHeader: 'fly-client-ip' }));
    expect(() => getTrustedRequestIp(localSocketEvent())).toThrow(expect.objectContaining({ statusCode: 403 }));
    expect(getTrustedRequestIp(localSocketEvent({ 'fly-client-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('does not hide an invalid address or a broken development socket', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('FLY_APP_NAME', '');
    vi.stubGlobal('useRuntimeConfig', () => ({ trustedClientIpHeader: '' }));
    expect(() => getTrustedRequestIp(event({}, 'invalid'))).toThrow(expect.objectContaining({ statusCode: 403 }));
    const request = localSocketEvent();
    Object.assign(request.node.req.socket, { readable: false });
    expect(() => getTrustedRequestIp(request)).toThrow(expect.objectContaining({ statusCode: 403 }));
  });

  it('ignores spoofable forwarding headers when direct socket identity is configured', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ trustedClientIpHeader: '' }));
    expect(getTrustedRequestIp(event({ 'x-forwarded-for': '203.0.113.7', 'cf-connecting-ip': '203.0.113.8' }))).toBe('127.0.0.1');
  });

  it('uses only the explicitly trusted proxy header', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ trustedClientIpHeader: 'fly-client-ip' }));
    expect(getTrustedRequestIp(event({ 'fly-client-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.1' }))).toBe('203.0.113.9');
  });

  it.each([{}, { 'fly-client-ip': 'not-an-ip' }, { 'fly-client-ip': '203.0.113.1, 203.0.113.2' }])('rejects missing or invalid trusted ingress identity', headers => {
    vi.stubGlobal('useRuntimeConfig', () => ({ trustedClientIpHeader: 'fly-client-ip' }));
    expect(() => getTrustedRequestIp(event({ ...headers, 'x-forwarded-for': '203.0.113.7' })))
      .toThrow(expect.objectContaining({ statusCode: 403 }));
  });
});
