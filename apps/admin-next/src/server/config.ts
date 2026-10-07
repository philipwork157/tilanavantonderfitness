import 'server-only';

/**
 * Server settings from the environment (apps/admin-next/.env.local locally).
 * Same settings as the Nuxt admin's runtimeConfig, without the NUXT_ prefix.
 * Read on every call, so tests and restarts always see current values.
 */
export function serverConfig() {
  const env = process.env;
  return {
    supabaseUrl: env.SUPABASE_URL ?? '',
    supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY ?? '',
    /** Server-only: blog image storage. Never expose to the browser. */
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    databaseUrl: env.DATABASE_URL ?? '',
    emailFromAddress: env.EMAIL_FROM_ADDRESS ?? '',
    emailFromName: env.EMAIL_FROM_NAME ?? '',
    /** Development only: every outgoing email goes here instead. */
    emailDevRedirectTo: env.EMAIL_DEV_REDIRECT_TO ?? '',
    contactNotifyTo: env.CONTACT_NOTIFY_TO ?? '',
    turnstileSecretKey: env.TURNSTILE_SECRET_KEY ?? '',
    /** Website origins allowed to call the public endpoints (comma separated). */
    websiteOrigins: env.WEBSITE_ORIGINS ?? '',
    /** Public website address used in email links, e.g. https://tilanavantonder.co.za. */
    websiteUrl: env.WEBSITE_URL ?? '',
    /** Who receives newsletter test emails (comma separated). */
    newsletterTestTo: env.NEWSLETTER_TEST_TO ?? '',
    /** Amazon SNS topic that delivers SES bounces and complaints (webhook is off when empty). */
    sesEventsTopicArn: env.SES_EVENTS_TOPIC_ARN ?? '',
  };
}

export const isDevelopment = process.env.NODE_ENV !== 'production';
