import { describe, expect, it } from 'vitest';
import { createLogger, maskEmail, maskIp, setRequestUser, withRequestLog } from '@/server/logger';

/** A logger that keeps its JSON lines in memory. */
function memoryLogger() {
  const lines: Record<string, unknown>[] = [];
  const log = createLogger({ write: (line: string) => void lines.push(JSON.parse(line) as Record<string, unknown>) }, 'debug');
  return { log, lines };
}

const request = (path: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost:3002${path}`, { method: 'POST', headers });

describe('API request logging', () => {
  it('logs one line per request with an ID, status and timing, and returns the ID', async () => {
    const { log, lines } = memoryLogger();
    const response = await withRequestLog(
      request('/api/contact?token=secret-token', { 'fly-client-ip': '102.33.4.25', 'x-forwarded-for': '6.6.6.6, 10.0.0.1' }),
      async () => Response.json({ ok: true }),
      log,
    );
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line).toMatchObject({ level: 30, method: 'POST', path: '/api/contact', status: 200, ip: '102.33.4.x', user: 'anonymous', app: 'admin' });
    expect(line.msg).toMatch(/^POST \/api\/contact → 200 in \d+ms$/);
    expect(typeof line.ms).toBe('number');
    expect(response.headers.get('x-request-id')).toBe(line.requestId);
    // The query string can hold tokens, so it is never logged.
    expect(JSON.stringify(line)).not.toContain('secret-token');
  });

  it('names the signed-in admin and tags lines logged during the request', async () => {
    const { log, lines } = memoryLogger();
    await withRequestLog(request('/api/programs'), async () => {
      setRequestUser({ id: 2, email: 'tilana@example.com' });
      log.info('Program saved');
      return new Response(null, { status: 204 });
    }, log);
    expect(lines.map((l) => l.user)).toEqual(['admin#2 t***@example.com', 'admin#2 t***@example.com']);
    expect(lines[0]!.requestId).toBe(lines[1]!.requestId);
  });

  it('reuses a well-formed request ID from the website and replaces anything else', async () => {
    const { log, lines } = memoryLogger();
    await withRequestLog(request('/api/public/programs', { 'x-request-id': 'web-1234abcd' }), async () => Response.json({}), log);
    await withRequestLog(request('/api/public/programs', { 'x-request-id': 'bad id <script>' }), async () => Response.json({}), log);
    expect(lines[0]!.requestId).toBe('web-1234abcd');
    expect(lines[1]!.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('logs client errors as warnings and server errors as errors', async () => {
    const { log, lines } = memoryLogger();
    await withRequestLog(request('/api/programs'), async () => Response.json({}, { status: 404 }), log);
    await withRequestLog(request('/api/programs'), async () => Response.json({}, { status: 502 }), log);
    expect(lines.map((l) => l.level)).toEqual([40, 50]);
  });

  it('redacts secrets and personal details even when logged by mistake', () => {
    const { log, lines } = memoryLogger();
    log.info({
      password: 'hunter2',
      headers: { authorization: 'Bearer abc', cookie: 'sb=1', 'set-cookie': 'sb=2' },
      customer: { email: 'buyer@example.com', phone: '0821234567' },
      err: { cause: { parameters: ['buyer@example.com'] } },
      turnstileToken: 'tt',
    }, 'oops');
    const text = JSON.stringify(lines[0]);
    for (const secret of ['hunter2', 'Bearer abc', 'sb=1', 'sb=2', 'buyer@example.com', '0821234567', '"tt"']) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain('[Redacted]');
  });

  it('masks emails and IP addresses', () => {
    expect(maskEmail('tilana@example.com')).toBe('t***@example.com');
    expect(maskEmail('not-an-email')).toBe('***');
    expect(maskIp('102.33.4.25')).toBe('102.33.4.x');
    expect(maskIp('2c0f:f4c0:1a2b:9:1:2:3:4')).toBe('2c0f:f4c0:1a2b:…');
  });

  it('cuts personal data out of database error messages', () => {
    const { log, lines } = memoryLogger();
    const cause = Object.assign(new Error('duplicate key value violates unique constraint'), { detail: 'Key (email)=(anna@example.com) already exists.' });
    const error = new Error('Failed query: insert into "orders" ("email") values ($1)\nparams: anna@example.com,Anna,Smit', { cause });
    log.error({ err: error }, 'Order could not be saved');
    const text = JSON.stringify(lines[0]);
    expect(text).not.toContain('anna@example.com');
    expect(text).not.toContain('Smit');
    expect(text).toContain('params: [Redacted]');
    expect(text).toContain('Failed query: insert into');
  });
});
