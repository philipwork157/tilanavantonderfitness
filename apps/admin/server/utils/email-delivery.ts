import { invoiceEmailSchema } from '@tilana/contracts/invoices';

type EmailDeliveryConfig = { emailDevelopmentEnabled?: boolean | string; emailDevelopmentRecipient?: string };

/** One switch and inbox for every SES delivery, independent of NODE_ENV on Fly. */
export function isDevelopmentEmailEnabled(config: EmailDeliveryConfig = useRuntimeConfig()): boolean {
  return config.emailDevelopmentEnabled === true || config.emailDevelopmentEnabled === 'true';
}

/** Test financial/customer email fails closed; live customer email cannot be redirected. */
export function getEmailRecipient(intendedEmail: string, options: { test?: boolean; live?: boolean; preview?: boolean } = {}, config: EmailDeliveryConfig = useRuntimeConfig()): string {
  const enabled = isDevelopmentEmailEnabled(config);
  if (options.live && enabled) throw new Error('Live customer email cannot use development delivery.');
  if (options.test && !enabled) throw new Error('Test customer email requires development delivery.');
  return invoiceEmailSchema.parse(enabled || options.preview ? String(config.emailDevelopmentRecipient || '').trim() : intendedEmail);
}
