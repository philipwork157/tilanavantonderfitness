import type { NextConfig } from 'next';

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
      { source: '/:path*', headers: [{ key: 'cache-control', value: 'private, no-store' }] },
      { source: '/api/public/:path*', headers: [{ key: 'cache-control', value: 'public, max-age=60' }] },
    ];
  },
};

export default config;
