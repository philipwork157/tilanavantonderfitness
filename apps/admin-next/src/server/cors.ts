import 'server-only';
import { serverConfig } from './config';
import { errorResponse, handle } from './http';
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

/** Wraps a public website POST handler: origin check, then CORS headers on every answer (errors too). */
export function websiteRoute(fn: (request: Request) => Promise<Response>) {
  const run = handle(fn);
  return async (request: Request): Promise<Response> => {
    const origin = allowedOrigin(request);
    if (!origin) return notAllowed();
    const response = await run(request);
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.append('Vary', 'Origin');
    return response;
  };
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
