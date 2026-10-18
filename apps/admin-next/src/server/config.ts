import 'server-only';

/**
 * Server settings from the environment (apps/admin-next/.env.local locally).
 * Read on every call, so tests and restarts always see current values.
 */
export function serverConfig() {
  const env = process.env;
  return {
    supabaseUrl: env.SUPABASE_URL ?? '',
    supabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY ?? '',
    databaseUrl: env.DATABASE_URL ?? '',
    /** pino level (trace, debug, info, warn, error, silent); empty = default for the environment. */
    logLevel: env.LOG_LEVEL ?? '',
    emailFromAddress: env.EMAIL_FROM_ADDRESS ?? '',
    emailFromName: env.EMAIL_FROM_NAME ?? '',
    /** Development only: every outgoing email goes here instead. */
    emailDevRedirectTo: env.EMAIL_DEV_REDIRECT_TO ?? '',
    contactNotifyTo: env.CONTACT_NOTIFY_TO ?? '',
    /**
     * The private R2 bucket for program PDFs. Two scoped API tokens, like the
     * old admin: one may only write (uploads), one may only read (emails).
     */
    r2AccountId: env.R2_ACCOUNT_ID ?? '',
    r2ProgramBucket: env.R2_PRIVATE_PROGRAM_BUCKET ?? '',
    r2UploadAccessKeyId: env.R2_UPLOAD_ACCESS_KEY_ID ?? '',
    r2UploadSecretAccessKey: env.R2_UPLOAD_SECRET_ACCESS_KEY ?? '',
    r2DownloadAccessKeyId: env.R2_DOWNLOAD_ACCESS_KEY_ID ?? '',
    r2DownloadSecretAccessKey: env.R2_DOWNLOAD_SECRET_ACCESS_KEY ?? '',
    /**
     * The public R2 bucket for the website's pictures (blog covers, recipe
     * photos, program "Peek inside" pages), served on its own domain. One
     * token with "Object Read & Write" on this bucket only.
     */
    r2PublicBucket: env.R2_PUBLIC_BUCKET ?? '',
    r2PublicUrl: env.R2_PUBLIC_URL ?? '',
    r2PublicAccessKeyId: env.R2_PUBLIC_ACCESS_KEY_ID ?? '',
    r2PublicSecretAccessKey: env.R2_PUBLIC_SECRET_ACCESS_KEY ?? '',
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
    /**
     * Secret for GET /api/cron/order-checks (sent as "Authorization: Bearer ..."),
     * for hosts that run scheduled jobs (e.g. Vercel Cron). Empty = that URL is off;
     * a long-running server also runs the checks itself every 5 minutes.
     */
    cronSecret: env.CRON_SECRET ?? '',
    /** Amazon SNS topic that delivers SES bounces and complaints (webhook is off when empty). */
    sesEventsTopicArn: env.SES_EVENTS_TOPIC_ARN ?? '',
    /**
     * PostHog, for the Website page. Server only: a personal API key with only
     * "Query: Read" for this project (phx_...), the project ID and the app host
     * for the project's region (https://eu.posthog.com). Empty key = page off.
     */
    posthogPersonalApiKey: env.POSTHOG_PERSONAL_API_KEY ?? '',
    posthogProjectId: env.POSTHOG_PROJECT_ID ?? '',
    posthogHost: env.POSTHOG_HOST || 'https://eu.posthog.com',
    /**
     * Whose visits the Website page shows: "production" (the live website) or
     * "development" (localhost and the dev website). Set in fly.toml / fly.prod.toml;
     * when empty, local `next dev` shows development and a production build shows production.
     */
    siteEnvironment: (env.SITE_ENVIRONMENT || (isDevelopment ? 'development' : 'production')) === 'production'
      ? 'production' as const : 'development' as const,
  };
}

export const isDevelopment = process.env.NODE_ENV !== 'production';
