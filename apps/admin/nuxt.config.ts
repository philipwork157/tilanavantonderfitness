export default defineNuxtConfig({
  extends: ['@tilana/ui-nuxt'],
  modules: ['@nuxt/eslint'],
  compatibilityDate: '2026-08-19',
  telemetry: false,
  runtimeConfig: {
    databaseUrl: '',
    supabaseUrl: '',
    supabasePublishableKey: '',
    supabaseServiceRoleKey: '',
    contactAllowedOrigins:
      'http://127.0.0.1:4321,http://localhost:4321,https://tilanavantonder.co.za,https://www.tilanavantonder.co.za',
    turnstileSecretKey: '',
    contactIpHashSecret: '',
    contactTurnstileRequired: process.env.NODE_ENV === 'production',
    emailFromAddress: '',
    emailFromName: 'Tilana van Tonder website',
    contactNotificationEnabled: false,
    contactNotificationTo: 'tilanavantonder@gmail.com',
    newsletterFromEmail: '',
    newsletterDevelopmentRecipient: 'tilanavantonder@gmail.com',
    newsletterApiBaseUrl: 'http://127.0.0.1:3001',
    newsletterSiteUrl: 'http://127.0.0.1:4321',
  },
  devtools: {
    enabled: false,
  },
  colorMode: {
    preference: 'system',
    fallback: 'light',
  },
  routeRules: {
    '/dashboard/**': { headers: { 'cache-control': 'private, no-store' } },
    '/contacts/**': { headers: { 'cache-control': 'private, no-store' } },
    '/api/auth/**': { headers: { 'cache-control': 'private, no-store' } },
    '/api/admin/**': { headers: { 'cache-control': 'private, no-store' } },
  },
  app: {
    head: {
      title: 'Tilana Admin',
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
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
