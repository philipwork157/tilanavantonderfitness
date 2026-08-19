import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://tilanavantonder.co.za',
  output: 'static',
  integrations: [sitemap()],
});
