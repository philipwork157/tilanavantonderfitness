import { payments } from '@tilana/db/schema';
import { and, eq, ne, or, isNull } from 'drizzle-orm';
import { getDatabase } from '@server/utils/database';
import type { Database } from '@tilana/db/server';

/** Do not infer the payment mode from NODE_ENV: the deployed dev app also uses production builds. */
export function getPaystackEnvironment(config = useRuntimeConfig()): 'test' | 'live' {
  if (config.paystackEnvironment !== 'test' && config.paystackEnvironment !== 'live') {
    throw createError({ statusCode: 503, statusMessage: 'Payment environment is not configured.' });
  }
  // The production portal must never serve real private files against test purchases,
  // even when every row in its database consistently says "test".
  const deploymentMode = process.env.FLY_APP_NAME === 'tilanavantonder-admin-prod' ? 'live'
    : process.env.FLY_APP_NAME === 'tilanavantonder-admin-dev' ? 'test' : undefined;
  if (deploymentMode && config.paystackEnvironment !== deploymentMode) {
    throw createError({ statusCode: 503, statusMessage: 'Payment mode does not match this deployment.' });
  }
  return config.paystackEnvironment;
}

/** Validate secrets without ever including their value in logs or error responses. */
export function getPaystackCredentials(config = useRuntimeConfig()) {
  const environment = getPaystackEnvironment(config);
  const secretKey = String(config.paystackSecretKey || '').trim();
  if (!secretKey.startsWith(`sk_${environment}_`) || secretKey.length <= `sk_${environment}_`.length) {
    throw createError({ statusCode: 503, statusMessage: 'Paystack key does not match the payment environment.' });
  }
  return { environment, secretKey };
}

/** Local HTTP is supported only for local test development, never deployed production builds or live mode. */
export function validatePaymentUrl(value: string, environment: 'test' | 'live') {
  let url: URL;
  try { url = new URL(value); } catch {
    throw createError({ statusCode: 503, statusMessage: 'Payment URL is not configured.' });
  }
  const loopback = ['localhost', '[::1]', '[::]', '0.0.0.0'].includes(url.hostname)
    || url.hostname.endsWith('.localhost') || /^127\./.test(url.hostname);
  const localDevelopment = environment === 'test' && process.env.NODE_ENV !== 'production' && loopback;
  if (url.username || url.password || url.hash || url.search
    || (!localDevelopment && (url.protocol !== 'https:' || loopback))
    || (localDevelopment && !['http:', 'https:'].includes(url.protocol))) {
    throw createError({ statusCode: 503, statusMessage: 'Payment URL must use a secure deployed host.' });
  }
  return url;
}

export function getPaystackCheckoutConfiguration(config = useRuntimeConfig()) {
  const credentials = getPaystackCredentials(config);
  const site = validatePaymentUrl(String(config.public.siteUrl || ''), credentials.environment);
  getCustomerAccountBaseUrl(config);
  if (site.pathname !== '/') {
    throw createError({ statusCode: 503, statusMessage: 'Checkout callback must match the public website.' });
  }
  return { ...credentials, callbackUrl: new URL('/checkout/complete', site).toString() };
}

export function getCustomerAccountBaseUrl(config = useRuntimeConfig()) {
  const url = validatePaymentUrl(String(config.accountBaseUrl || ''), getPaystackEnvironment(config));
  if (url.pathname !== '/') {
    throw createError({ statusCode: 503, statusMessage: 'Customer account URL must be an origin.' });
  }
  return url.origin;
}

/** Quarantine mixed-mode databases rather than letting legacy test access become live access.
 * Production must use an isolated database; never relabel or delete financial history to pass this check.
 * Apply at consumption as well as provider writes, including already-linked customer sessions.
 */
export async function assertPaystackDatabaseEnvironment(database: Pick<Database, 'select'> = getDatabase()) {
  const environment = getPaystackEnvironment();
  const [foreignPayment] = await database.select({ id: payments.id }).from(payments)
    .where(and(eq(payments.provider, 'paystack'), or(ne(payments.environment, environment), isNull(payments.environment))))
    .limit(1);
  if (foreignPayment) {
    throw createError({ statusCode: 503, statusMessage: 'Payment database environment isolation requires review.' });
  }
}
