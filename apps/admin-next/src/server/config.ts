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
    /** pino level (trace, debug, info, warn, error, silent); empty = default for the environment. */
    logLevel: env.LOG_LEVEL ?? '',
    emailFromAddress: env.EMAIL_FROM_ADDRESS ?? '',
    emailFromName: env.EMAIL_FROM_NAME ?? '',
    /** Development only: every outgoing email goes here instead. */
    emailDevRedirectTo: env.EMAIL_DEV_REDIRECT_TO ?? '',
    contactNotifyTo: env.CONTACT_NOTIFY_TO ?? '',
    /**
     * Cloudflare R2 for private program PDFs. Two scoped API tokens, like the
     * old admin: one may only write (uploads), one may only read (emails).
     */
    r2AccountId: env.R2_ACCOUNT_ID ?? '',
    r2ProgramBucket: env.R2_PRIVATE_PROGRAM_BUCKET ?? '',
    r2UploadAccessKeyId: env.R2_UPLOAD_ACCESS_KEY_ID ?? '',
    r2UploadSecretAccessKey: env.R2_UPLOAD_SECRET_ACCESS_KEY ?? '',
    r2DownloadAccessKeyId: env.R2_DOWNLOAD_ACCESS_KEY_ID ?? '',
    r2DownloadSecretAccessKey: env.R2_DOWNLOAD_SECRET_ACCESS_KEY ?? '',
    turnstileSecretKey: env.TURNSTILE_SECRET_KEY ?? '',
    /** Server-only Paystack secret key: sk_test_... in development, sk_live_... in production. */
    paystackSecretKey: env.PAYSTACK_SECRET_KEY ?? '',
    /** "test" or "live"; must match the key, so a live key is never used by accident. */
    paystackMode: env.PAYSTACK_MODE ?? '',
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
