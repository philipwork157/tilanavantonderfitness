import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTrustedRequestIp } from '@server/utils/request-identity';
import type { H3Event } from 'h3';

function event(headers: Record<string, string>, remoteAddress = '127.0.0.1') {
  return { node: { req: { headers, socket: { remoteAddress } } } } as unknown as H3Event;
}

beforeEach(() => {
  vi.stubGlobal('getHeader', (input: ReturnType<typeof event>, name: string) => input.node.req.headers[name]);
  vi.stubGlobal('getRequestIP', (input: ReturnType<typeof event>) => input.node.req.socket.remoteAddress);
});

describe('trusted ingress identity', () => {
  it('ignores spoofable forwarding headers when direct socket identity is configured', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ trustedClientIpHeader: '' }));
    expect(getTrustedRequestIp(event({ 'x-forwarded-for': '203.0.113.7', 'cf-connecting-ip': '203.0.113.8' }))).toBe('127.0.0.1');
  });

  it('uses only the explicitly trusted proxy header', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ trustedClientIpHeader: 'fly-client-ip' }));
    expect(getTrustedRequestIp(event({ 'fly-client-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.1' }))).toBe('203.0.113.9');
  });

  it.each([{}, { 'fly-client-ip': 'not-an-ip' }])('rejects missing or invalid trusted ingress identity', headers => {
    vi.stubGlobal('useRuntimeConfig', () => ({ trustedClientIpHeader: 'fly-client-ip' }));
    vi.stubGlobal('createError', (input: object) => Object.assign(new Error('denied'), input));
    expect(() => getTrustedRequestIp(event(headers))).toThrow('denied');
  });
});
