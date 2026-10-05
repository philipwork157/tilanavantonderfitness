// Tilana admin. Supabase handles password sign-in; NUXT_ADMIN_EMAILS decides who is an admin.
export default defineNuxtConfig({
  extends: ['@tilana/ui-nuxt'],
  modules: ['@nuxt/eslint'],
  compatibilityDate: '2026-08-19',
  telemetry: false,
  devtools: { enabled: false },
  colorMode: { preference: 'system', fallback: 'light' },
  runtimeConfig: {
    // Server-only. Set with NUXT_SUPABASE_URL, NUXT_SUPABASE_PUBLISHABLE_KEY and NUXT_ADMIN_EMAILS.
    supabaseUrl: '',
    supabasePublishableKey: '',
    adminEmails: '',
  },
  routeRules: {
    '/**': { headers: { 'cache-control': 'private, no-store' } },
  },
  app: {
    head: {
      title: 'Tilana Admin',
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
      meta: [
        { name: 'robots', content: 'noindex, nofollow' },
        { name: 'description', content: 'Private administration for Tilana van Tonder.' },
      ],
    },
  },
  eslint: { config: { autoInit: false } },
});
