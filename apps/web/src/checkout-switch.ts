/**
 * The online checkout switch, flipped at runtime in Cloudflare (no rebuild),
 * like maintenance mode.
 *
 * Off: Cloudflare dashboard → Workers → tilanavantonder-website-prod →
 *      Settings → Variables and secrets → CHECKOUT_MODE = off → Deploy.
 * On:  set it to on.
 * Not set: the build's PUBLIC_CHECKOUT_ENABLED decides (see site/config.ts).
 *
 * While it is off, the website looks exactly as it does without online
 * checkout: no Add to basket, no basket, program buttons open the contact form
 * and /checkout says online checkout is coming soon. /checkout/complete keeps
 * working so people mid-payment still see their order. Browsers with the
 * maintenance preview cookie (?preview=<MAINTENANCE_BYPASS_TOKEN>) still see
 * the checkout, so it can be tested on the live site before anyone else.
 *
 * This only hides the website's buttons. The admin still accepts and verifies
 * payments, so a checkout someone already started finishes normally.
 *
 * src/worker.ts decides once per request and tells Astro with CHECKOUT_HEADER
 * (pages rendered on request read it as Astro.locals.checkout) and the browser
 * with <html data-checkout="on|off"> (prebuilt pages hide the basket with CSS).
 */
import { hasPreviewCookie, type MaintenanceEnv } from '@web/maintenance';

export type CheckoutEnv = MaintenanceEnv & { CHECKOUT_MODE?: unknown };

/** Set by the Worker on every page request it passes to Astro (any incoming copy is replaced). */
export const CHECKOUT_HEADER = 'x-tvt-checkout';

/**
 * CHECKOUT_MODE as on (true), off (false) or not set (null). Anything else
 * counts as off, so a typo never opens the checkout by accident.
 */
export function checkoutMode(value: unknown): boolean | null {
  const setting = String(value ?? '').trim().toLowerCase();
  if (setting === '') return null;
  return ['on', 'true', '1', 'yes', 'enabled', 'enable'].includes(setting);
}

/** Whether this request sees the online checkout. `fallback` is the build's setting. */
export async function checkoutOpen(request: Request, env: CheckoutEnv, fallback: boolean): Promise<boolean> {
  if (checkoutMode(env.CHECKOUT_MODE) ?? fallback) return true;
  return hasPreviewCookie(request, env);
}

/** Read back by the middleware; without the Worker's header the build's setting applies. */
export function checkoutFromHeader(headers: Headers, fallback: boolean): boolean {
  const value = headers.get(CHECKOUT_HEADER);
  return value === 'on' ? true : value === 'off' ? false : fallback;
}
