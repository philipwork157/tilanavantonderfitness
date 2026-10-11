import 'server-only';
import { logger, withRequestLog } from './logger';

/**
 * An error with an HTTP status and a message that is safe to show. Responses
 * always use the same { statusCode, statusMessage } shape, so the website and
 * the admin screens read every error the same way.
 */
export class HttpError extends Error {
  constructor(readonly statusCode: number, readonly statusMessage: string) {
    super(statusMessage);
  }
}

export function errorResponse(statusCode: number, statusMessage: string) {
  return Response.json({ statusCode, statusMessage }, { status: statusCode });
}

/** Route handler context for dynamic segments, e.g. /api/blog-posts/[id]. */
export interface IdContext {
  params: Promise<{ id: string }>;
}

/** Turns thrown HttpErrors into JSON error responses; anything else is logged and becomes a 500. */
export function catchErrors<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error.statusCode, error.statusMessage);
      logger.error({ err: error }, 'Unexpected API error');
      return errorResponse(500, 'Something went wrong. Please try again.');
    }
  };
}

/**
 * Wraps a route handler: thrown HttpErrors become JSON error responses, and
 * the request is logged with its own request ID (see logger.ts).
 */
export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  const run = catchErrors(fn);
  return async (...args: Args): Promise<Response> => {
    const request = args[0];
    return request instanceof Request ? withRequestLog(request, () => run(...args)) : run(...args);
  };
}

/** The JSON body, or null when it is missing or invalid (zod then rejects it). */
export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}

/** Positive integer id from the route, or a 400. */
export async function routeId(context: IdContext, message = 'Unknown item.'): Promise<number> {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, message);
  return id;
}

/** State-changing requests must come from this site (basic CSRF protection). */
export function sameOriginOnly(request: Request, isSameOrigin: (origin?: string, host?: string) => boolean) {
  const origin = request.headers.get('origin') ?? undefined;
  const host = request.headers.get('host') ?? undefined;
  if (!isSameOrigin(origin, host)) throw new HttpError(403, 'Request origin is not allowed.');
}

export { clientIp } from './client-ip';
