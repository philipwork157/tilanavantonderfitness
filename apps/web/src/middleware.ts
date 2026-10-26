import { defineMiddleware } from 'astro:middleware';
import { checkoutFromHeader } from '@web/checkout-switch';
import { checkoutEnabled } from '@web/site/config';
import { SECURITY_HEADERS } from '@web/utils/security-headers';

/**
 * Sets Astro.locals.checkout from the Worker's decision (src/checkout-switch.ts)
 * and adds the security headers to pages rendered on request (prebuilt pages
 * get them from src/worker.ts). Prebuilt pages use the build's setting; the
 * Worker then shows or hides their basket with <html data-checkout>.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.checkout = context.isPrerendered ? checkoutEnabled : checkoutFromHeader(context.request.headers, checkoutEnabled);
  const response = await next();
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!response.headers.has(name)) response.headers.set(name, value);
  }
  return response;
});
