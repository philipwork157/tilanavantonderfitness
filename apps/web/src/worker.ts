/**
 * The website's Cloudflare Worker (wrangler.jsonc "main"). It runs before
 * every page, prebuilt ones included (assets.run_worker_first), so that
 * maintenance mode (src/maintenance.ts) can take over the whole site without a
 * rebuild. Everything else goes to Astro's own handler unchanged. Files under
 * /_astro, /images and the icons skip the Worker entirely.
 */
import { handle } from '@astrojs/cloudflare/handler';
import { maintenanceResponse, type MaintenanceEnv } from '@web/maintenance';
import { SECURITY_HEADERS } from '@web/utils/security-headers';

type HandleEnv = Parameters<typeof handle>[1];
type HandleContext = Parameters<typeof handle>[2];

/**
 * Cloudflare does not apply public/_headers to responses that come through a
 * Worker, so prebuilt pages get their security headers here (the middleware
 * already adds them to pages rendered on request).
 */
function withSecurityHeaders(response: Response): Response {
  if (Object.keys(SECURITY_HEADERS).every((name) => response.headers.has(name))) return response;
  const copy = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!copy.headers.has(name)) copy.headers.set(name, value);
  }
  return copy;
}

export default {
  async fetch(request: Request, env: HandleEnv, context: HandleContext): Promise<Response> {
    const maintenance = await maintenanceResponse(request, env as unknown as MaintenanceEnv);
    if (maintenance) return withSecurityHeaders(maintenance);
    return withSecurityHeaders(await handle(request, env, context) as unknown as Response);
  },
};
