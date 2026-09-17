import { timingSafeEqual } from 'node:crypto';
import { paymentRecoveryAlertEmailSchema } from '@tilana/contracts/payments';

/** Machine-only bearer capability; intentionally distinct from Paystack keys and admin cookies. */
export function authorizePaymentRecovery(authorization: string | undefined, config = useRuntimeConfig()) {
  const token = String(config.paystackRecoveryToken || '');
  if (config.paystackRecoveryEnabled !== true || token.length < 32
    || !paymentRecoveryAlertEmailSchema.safeParse(config.paystackRecoveryAlertTo).success) {
    throw createError({ statusCode: 503, statusMessage: 'Payment recovery is not configured.' });
  }
  const supplied = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  const actual = Buffer.from(supplied);
  const expected = Buffer.from(token);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw createError({ statusCode: 401, statusMessage: 'Recovery authorization required.' });
  }
}
