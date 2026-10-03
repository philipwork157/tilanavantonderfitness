import { paymentRecoveryAlertEmailSchema } from '@tilana/contracts/payments';
import { getEmailRecipient } from './email-delivery';
import { getServerEmail } from './email';

/** A local worker is never a substitute for the deployed, externally scheduled worker. */
export function isLocalCustomerWorkerEnabled(config = useRuntimeConfig()): boolean {
  return process.env.NODE_ENV === 'development' && !process.env.FLY_APP_NAME
    && config.localCustomerNotificationsWorkerEnabled === true;
}

/** Reject known delivery failures before opening a charge; this never sends an email. */
export async function assertCustomerDeliveryConfigured(email: string): Promise<void> {
  const config = useRuntimeConfig();
  const scheduled = config.paystackRecoveryEnabled === true
    && String(config.paystackRecoveryToken || '').length >= 32
    && paymentRecoveryAlertEmailSchema.safeParse(config.paystackRecoveryAlertTo).success;
  try {
    if (config.customerNotificationsEnabled !== true || (!scheduled && !isLocalCustomerWorkerEnabled(config))) {
      throw new Error('Customer email delivery and retries must be enabled.');
    }
    getEmailRecipient(email, { test: config.paystackEnvironment === 'test', live: config.paystackEnvironment === 'live' }, config);
    const { sender } = getServerEmail();
    // IAM roles and profiles remain supported. A bounded resolution detects missing credentials,
    // not SES authorization or future provider availability, which require operational verification.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([sender.checkConfiguration(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Email configuration check timed out.')), 5000);
      })]);
    } finally { clearTimeout(timer); }
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Program email delivery is not ready. Please try again later. No payment was started.' });
  }
}
