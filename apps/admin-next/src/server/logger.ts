import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import pino, { type DestinationStream, type Logger } from 'pino';
import pretty from 'pino-pretty';
import { clientIp } from './client-ip';
import { isDevelopment, serverConfig } from './config';

/**
 * Server logging (pino). One line per API request, plus any warnings and
 * errors logged while handling it. Every line carries the request's ID and,
 * once signed in, the admin (`admin#2 t***@gmail.com`).
 *
 * Development prints readable, coloured lines; production prints one JSON
 * object per line for a log service. LOG_LEVEL overrides the level
 * (default: debug in development, info in production, silent in tests).
 *
 * Never log request bodies, PDFs, tokens or full email addresses. Fields named
 * in REDACTED_FIELDS are replaced with [Redacted] even if logged by mistake.
 */

export const REDACTED_FIELDS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'turnstileToken',
  'secret',
  'apiKey',
  'authorization',
  'cookie',
  'set-cookie',
  'email',
  'phone',
  'body',
  'data',
  // Database errors carry the query's values (names, emails).
  'parameters',
  'params',
];

// Each field at the top level, one level down (headers.cookie, user.email) and two levels down.
const redactPaths = REDACTED_FIELDS.flatMap((field) => {
  const plain = /^[A-Za-z_$][\w$]*$/.test(field);
  const at = (prefix: string) => (plain ? `${prefix}${prefix ? '.' : ''}${field}` : `${prefix}["${field}"]`);
  return [at(''), at('*'), at('*.*')];
});

export interface RequestContext {
  requestId: string;
  /** "admin#2 t***@gmail.com" once requireAdmin has run; otherwise anonymous. */
  user?: string;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

/** The request being handled right now (inside an API route), if any. */
export function currentRequest(): RequestContext | undefined {
  return requestContext.getStore();
}

/** Records who is making this request, so every log line for it names them. */
export function setRequestUser(user: { id: number; email: string }): void {
  const context = requestContext.getStore();
  if (context) context.user = `admin#${user.id} ${maskEmail(user.email)}`;
}

function defaultLevel(): string {
  const configured = serverConfig().logLevel;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'test') return 'silent';
  return isDevelopment ? 'debug' : 'info';
}

function defaultDestination(): DestinationStream | undefined {
  if (!isDevelopment) return undefined;
  // Synchronous pretty printing: no worker thread, so it works inside Next's dev server.
  return pretty({
    colorize: true,
    sync: true,
    translateTime: 'SYS:HH:MM:ss',
    // The message already says method, path, status and time; show who and which request after it.
    ignore: 'pid,hostname,app,method,path,status,ms',
    singleLine: true,
  });
}

/**
 * Error messages can quote personal data even when no field is named "email":
 * a failed database query lists its values ("params: anna@example.com, ...")
 * and Postgres explains clashes as "Key (email)=(anna@example.com)". These are
 * cut out of every message, stack and detail before an error is logged.
 */
export function scrubErrorText(text: string): string {
  return text
    .replace(/\nparams: [^\n]*/g, '\nparams: [Redacted]')
    .replace(/(Key \([^)]*\)=\()[^)]*\)/g, '$1[Redacted])')
    .replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g, '$1***@$2');
}

function scrubErrorObject(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrubErrorText(value);
  if (!value || typeof value !== 'object' || depth > 4) return value;
  if (Array.isArray(value)) return value.map((item) => scrubErrorObject(item, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubErrorObject(item, depth + 1)]));
}

function serializeError(error: unknown) {
  return scrubErrorObject(pino.stdSerializers.err(error as Error));
}

export function createLogger(destination = defaultDestination(), level = defaultLevel()): Logger {
  const options = {
    level,
    base: { app: 'admin' },
    redact: { paths: redactPaths, censor: '[Redacted]' },
    serializers: { err: serializeError },
    // Adds the request ID and user to every line logged while handling a request.
    mixin() {
      const context = requestContext.getStore();
      return context ? { requestId: context.requestId, user: context.user ?? 'anonymous' } : {};
    },
  };
  return destination ? pino(options, destination) : pino(options);
}

export const logger = createLogger();

/** t***@gmail.com: enough to recognise an account without exposing the address. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

/** 102.33.4.x / 2c0f:f4c0:1a2b:… : roughly where, not exactly who. */
export function maskIp(ip: string): string {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip.replace(/\.\d{1,3}$/, '.x');
  if (ip.includes(':')) return `${ip.split(':').slice(0, 3).join(':')}:…`;
  return ip;
}

// A request ID passed on by the website's server (x-request-id) is reused so both logs match.
const requestIdPattern = /^[A-Za-z0-9._-]{8,80}$/;

function requestIdFor(request: Request): string {
  const incoming = request.headers.get('x-request-id');
  return incoming && requestIdPattern.test(incoming) ? incoming : randomUUID();
}

function visitorIp(request: Request): string {
  const ip = clientIp(request);
  return ip === 'unknown' ? 'local' : ip;
}

/**
 * Runs one API request with its own request ID, then logs a single summary
 * line: method, path (never the query string, which can hold tokens), status,
 * time taken, masked visitor IP and who was signed in. The ID is returned in
 * the x-request-id response header so a visitor or the website can quote it.
 */
export async function withRequestLog(request: Request, run: () => Promise<Response>, log: Logger = logger): Promise<Response> {
  const context: RequestContext = { requestId: requestIdFor(request) };
  return requestContext.run(context, async () => {
    const started = performance.now();
    const { pathname } = new URL(request.url);
    const summary = { method: request.method, path: pathname, ip: maskIp(visitorIp(request)) };
    let response: Response;
    try {
      response = await run();
    } catch (error) {
      log.error({ ...summary, err: error, ms: Math.round(performance.now() - started) }, `${request.method} ${pathname} failed`);
      throw error;
    }
    const ms = Math.round(performance.now() - started);
    const level = response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info';
    log[level]({ ...summary, status: response.status, ms }, `${request.method} ${pathname} → ${response.status} in ${ms}ms`);
    try {
      response.headers.set('x-request-id', context.requestId);
    } catch {
      // Some responses (redirects) have read-only headers; the log line still has the ID.
    }
    return response;
  });
}
