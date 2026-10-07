import 'server-only';

/**
 * An error with an HTTP status and a message that is safe to show. Responses
 * use the same { statusCode, statusMessage } shape as the Nuxt admin, so the
 * website and screens read errors the same way from either app.
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

/** Wraps a route handler so thrown HttpErrors become JSON error responses. */
export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof HttpError) return errorResponse(error.statusCode, error.statusMessage);
      console.error('Unexpected API error', error);
      return errorResponse(500, 'Something went wrong. Please try again.');
    }
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

/** The visitor's IP, from the proxy header when present. */
export function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
