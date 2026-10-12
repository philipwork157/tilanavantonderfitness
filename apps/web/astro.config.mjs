import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

const site = 'https://tilanavantonder.co.za';

export default defineConfig({
  site,
  // Pages are prebuilt files by default. The home page, programs, blog and
  // Kitchen (prerender = false) are rendered on request by the Cloudflare
  // Worker, so what is published in the admin appears without a rebuild.
  output: 'static',
  // One address per page, without a trailing slash (/about, not /about/), the
  // way every link on the site is written. Prebuilt pages are saved as
  // about.html, which Cloudflare serves at /about; /about/ redirects there.
  trailingSlash: 'never',
  build: { format: 'file' },
  // No visitor sessions, so the adapter does not create a Cloudflare KV store.
  session: false,
  adapter: cloudflare({ imageService: 'compile', prerenderEnvironment: 'node' }),
  // React islands (with Motion) for the interactive parts of the site, and the
  // sitemap of the prebuilt pages (the pages rendered on request have their own:
  // src/pages/sitemap-*.xml.ts).
  integrations: [
    react(),
    sitemap({
      customSitemaps: [`${site}/sitemap-pages.xml`, `${site}/sitemap-blog.xml`],
      // Left out: pages asking not to be indexed (basket, payment status,
      // newsletter) and the pages already in sitemap-pages.xml or
      // sitemap-blog.xml, which carry their last-changed dates.
      filter: (page) => {
        const path = new URL(page).pathname.replace(/\/$/, '') || '/';
        return !/^\/(checkout|newsletter)(\/|$)/.test(path) && !['/', '/program', '/kitchen', '/blog'].includes(path);
      },
    }),
  ],
  devToolbar: { enabled: false },
  // Astro's own cross-site POST check is off: the only POST route is the
  // newsletter one-click unsubscribe, which mail apps call from their servers
  // (no Origin header). Forms on the site post to the admin, which checks
  // origins itself.
  security: { checkOrigin: false },
  vite: {
    resolve: {
      alias: {
        '@web': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  },
});
