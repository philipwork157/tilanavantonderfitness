import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://tilanavantonder.co.za',
  output: 'static',
  integrations: [sitemap()],
  vite: {
    resolve: {
      alias: {
        '@web': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  },
});
