/**
 * The website's Cloudflare Worker (wrangler.jsonc "main"). It runs before
 * every page, prebuilt ones included (assets.run_worker_first), so that
 * maintenance mode (src/maintenance.ts) and the checkout switch
 * (src/checkout-switch.ts) work without a rebuild. Everything else goes to
 * Astro's own handler. Files under /_astro, /images and the icons skip the
 * Worker entirely.
 */
import { handle } from '@astrojs/cloudflare/handler';
import { CHECKOUT_HEADER, checkoutOpen, type CheckoutEnv } from '@web/checkout-switch';
import { maintenanceResponse } from '@web/maintenance';
import { checkoutEnabled } from '@web/site/config';
import { SECURITY_HEADERS } from '@web/utils/security-headers';

/** The Workers runtime's streaming HTML rewriter (only the part used here; no Workers types in this app). */
declare class HTMLRewriter {
  on(selector: string, handlers: { element(element: { setAttribute(name: string, value: string): void }): void }): HTMLRewriter;
  transform(response: Response): Response;
}

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

/**
 * Tells Astro whether this visitor sees the checkout. Conditional headers are
 * dropped so a page is never answered with "304, use your saved copy": that
 * copy may have been saved while the checkout was in the other state.
 */
function withCheckoutHeader(request: Request, open: boolean): Request {
  const headers = new Headers(request.headers);
  headers.set(CHECKOUT_HEADER, open ? 'on' : 'off');
  headers.delete('if-none-match');
  headers.delete('if-modified-since');
  return new Request(request, { headers });
}

/** Marks every page <html data-checkout="on|off"> so prebuilt pages show or hide the basket. */
function withCheckoutMark(response: Response, open: boolean): Response {
  if (!(response.headers.get('content-type') ?? '').includes('text/html') || !response.body) return response;
  const marked = new HTMLRewriter()
    .on('html', { element: (html) => { html.setAttribute('data-checkout', open ? 'on' : 'off'); } })
    .transform(response);
  const copy = new Response(marked.body, marked);
  // The page now depends on the switch and the visitor's preview cookie: browser-only caching, no validators.
  copy.headers.delete('etag');
  copy.headers.delete('last-modified');
  const cacheControl = copy.headers.get('cache-control');
  if (cacheControl?.includes('public')) copy.headers.set('cache-control', cacheControl.replace('public', 'private'));
  return copy;
}

export default {
  async fetch(request: Request, env: HandleEnv, context: HandleContext): Promise<Response> {
    const settings = env as unknown as CheckoutEnv;
    const maintenance = await maintenanceResponse(request, settings);
    if (maintenance) return withSecurityHeaders(maintenance);
    const open = await checkoutOpen(request, settings, checkoutEnabled);
    const response = await handle(withCheckoutHeader(request, open), env, context) as unknown as Response;
    return withSecurityHeaders(withCheckoutMark(response, open));
  },
};
