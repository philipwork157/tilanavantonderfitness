import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTrustedRequestIp } from '@server/utils/request-identity';
import type { H3Event } from 'h3';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

function event(headers: Record<string, string>, remoteAddress = '127.0.0.1') {
  return { node: { req: { headers, socket: { remoteAddress } } } } as unknown as H3Event;
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
