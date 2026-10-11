import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

const site = 'https://tilanavantonder.co.za';

export default defineConfig({
  site,
  // Pages are prebuilt files by default. The home page and the blog
  // (prerender = false) are rendered on request by the Cloudflare Worker, so
  // new posts appear without rebuilding the website.
  output: 'static',
  // No visitor sessions, so the adapter does not create a Cloudflare KV store.
  session: false,
  adapter: cloudflare({ imageService: 'compile', prerenderEnvironment: 'node' }),
  // React islands (with Motion) for the interactive parts of the site.
  integrations: [react(), sitemap({ customSitemaps: [`${site}/sitemap-blog.xml`] })],
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
