import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineNuxtConfig } from 'nuxt/config';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  css: [join(currentDirectory, './app/assets/css/main.css')],
  icon: {
    clientBundle: {
      scan: true,
      icons: [
        'lucide:arrow-right',
        'lucide:check',
        'lucide:eye',
        'lucide:eye-off',
        'lucide:info',
        'lucide:key-round',
        'lucide:lock-keyhole',
        'lucide:mail',
        'lucide:moon',
        'lucide:shield-check',
        'lucide:sun',
      ],
    },
  },
  fonts: {
    providers: {
      adobe: false,
      bunny: false,
      fontshare: false,
      fontsource: false,
      google: false,
      googleicons: false,
      npm: false,
    },
  },
});
