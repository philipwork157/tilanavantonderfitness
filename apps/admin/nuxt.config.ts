// A clean local starting point. Backend features and credentials are not connected.
export default defineNuxtConfig({
  extends: ['@tilana/ui-nuxt'],
  modules: ['@nuxt/eslint'],
  compatibilityDate: '2026-08-19',
  telemetry: false,
  devtools: { enabled: false },
  colorMode: { preference: 'system', fallback: 'light' },
  routeRules: {
    '/**': { headers: { 'cache-control': 'private, no-store' } },
  },
  app: {
    head: {
      title: 'Tilana Admin | Fresh start',
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
      meta: [
        { name: 'robots', content: 'noindex, nofollow' },
        { name: 'description', content: 'Local starting point for the new Tilana administration website.' },
      ],
    },
  },
  eslint: { config: { autoInit: false } },
});
