export default defineNuxtConfig({
  extends: ['@tilana/ui-nuxt'],
  modules: ['@nuxt/eslint'],
  compatibilityDate: '2026-08-19',
  telemetry: false,
  devtools: {
    enabled: false,
  },
  app: {
    head: {
      title: 'Tilana Admin',
      meta: [
        {
          name: 'description',
          content: 'Private administration portal for Tilana van Tonder.',
        },
      ],
    },
  },
  eslint: {
    config: {
      autoInit: false,
    },
  },
});
