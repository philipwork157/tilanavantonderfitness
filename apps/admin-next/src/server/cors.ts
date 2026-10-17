import 'server-only';
import { serverConfig } from './config';
import { catchErrors, errorResponse } from './http';
import { withRequestLog } from './logger';
import { parseOrigins } from './utils/website-origins';

/**
 * Only the public website endpoints accept cross-origin requests, and only
 * from the origins in WEBSITE_ORIGINS. Admin APIs stay same-origin.
 */
function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get('origin')?.replace(/\/+$/, '');
  if (!origin) return null;
  return parseOrigins(serverConfig().websiteOrigins).includes(origin) ? origin : null;
}

const notAllowed = () => errorResponse(403, 'This website is not allowed to send to this address.');

/** Lets the website read the response, including its request ID. */
function allowWebsite(response: Response, origin: string): Response {
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Expose-Headers', 'x-request-id');
  response.headers.append('Vary', 'Origin');
  return response;
}

/** Wraps a public website POST handler: origin check, then CORS headers on every answer (errors too). Logged like every API request. */
export function websiteRoute(fn: (request: Request) => Promise<Response>) {
  const run = catchErrors(fn);
  return (request: Request): Promise<Response> =>
    withRequestLog(request, async () => {
      const origin = allowedOrigin(request);
      if (!origin) return notAllowed();
      return allowWebsite(await run(request), origin);
    });
}

/** Answers the browser's preflight (OPTIONS) request for a public website endpoint. */
export function websitePreflight(request: Request): Response {
  const origin = allowedOrigin(request);
  if (!origin) return notAllowed();
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    },
  });
}

/**
 * Wraps a public read-only GET (published programs and prices). The Worker
 * calls it server-side without an Origin; browsers on the website get CORS
 * headers so the basket and checkout can read live prices. Other origins get
 * the same public data, just without permission to read it from a browser.
 */
export function publicReadRoute<Args extends unknown[]>(fn: (request: Request, ...rest: Args) => Promise<Response>) {
  const run = catchErrors(fn);
  return (request: Request, ...rest: Args): Promise<Response> =>
    withRequestLog(request, async () => {
      const response = await run(request, ...rest);
      const origin = allowedOrigin(request);
      return origin ? allowWebsite(response, origin) : response;
    });
}
