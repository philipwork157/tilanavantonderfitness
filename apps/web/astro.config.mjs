import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

const site = 'https://tilanavantonder.co.za';

export default defineConfig({
  site,
  // Pages are prebuilt files by default. Only the blog (prerender = false)
  // is rendered on request by the Cloudflare Worker, so new posts appear
  // without rebuilding the website.
  output: 'static',
  // No visitor sessions, so the adapter does not create a Cloudflare KV store.
  session: false,
  adapter: cloudflare({ imageService: 'compile', prerenderEnvironment: 'node' }),
  integrations: [sitemap({ customSitemaps: [`${site}/sitemap-blog.xml`] })],
  vite: {
    resolve: {
      alias: {
        '@web': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  },
});
