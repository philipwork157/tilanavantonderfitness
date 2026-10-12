/**
 * Security headers for every page of the website. Prebuilt pages get them from
 * `public/_headers` (Cloudflare serves those files directly); pages rendered on
 * request get them from `src/middleware.ts`. A test keeps the two the same.
 *
 * The full content policy is report-only for now: the browser console lists
 * anything it would block, without blocking it. Switch it to
 * Content-Security-Policy once a deployed site shows no reports.
 */
export const CONTENT_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://eu-assets.i.posthog.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://media.tilanavantonder.co.za https://media-dev.tilanavantonder.co.za",
  "font-src 'self' data:",
  "connect-src 'self' https://admin.tilanavantonder.co.za https://admin-dev.tilanavantonder.co.za https://eu.i.posthog.com https://eu-assets.i.posthog.com https://challenges.cloudflare.com",
  'frame-src https://challenges.cloudflare.com',
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

export const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  // Enforced now: no framing of the site (clickjacking), no plugins, no <base> tricks.
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  'Content-Security-Policy-Report-Only': CONTENT_POLICY,
};
