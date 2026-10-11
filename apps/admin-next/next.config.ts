import type { NextConfig } from 'next';

/**
 * On every admin page and API answer: HTTPS only, never inside another site's
 * frame (so nobody can trick a click on "Refund" or "Send"), no guessing file
 * types, no full addresses sent to other sites, and kept out of search engines.
 */
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

const config: NextConfig = {
  // Workspace packages ship TypeScript source, so Next compiles them.
  transpilePackages: ['@tilana/contracts', '@tilana/db'],
  // Native or Node-only packages stay outside the server bundle.
  serverExternalPackages: ['sharp', '@aws-sdk/client-sesv2', 'pdfjs-dist', '@napi-rs/canvas'],
  poweredByHeader: false,
  reactStrictMode: true,
  // `next dev` would otherwise write AGENTS.md/CLAUDE.md here; the repo-level CLAUDE.md covers this app.
  agentRules: false,
  // The dev-only Next.js badge sits bottom-right, clear of the sidebar account menu.
  devIndicators: { position: 'bottom-right' },
  async headers() {
    // Later rules win for the same header: admin pages and APIs are never cached,
    // the published blog posts may be cached for a minute.
    return [
      { source: '/:path*', headers: [{ key: 'cache-control', value: 'private, no-store' }, ...securityHeaders] },
      { source: '/api/public/:path*', headers: [{ key: 'cache-control', value: 'public, max-age=60' }] },
    ];
  },
};

export default config;
