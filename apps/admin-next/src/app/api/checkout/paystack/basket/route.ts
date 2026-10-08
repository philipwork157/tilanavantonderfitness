import { basketCheckoutRequestSchema } from '@tilana/contracts/checkout';
import { createAttemptLimiter } from '@/server/auth/admin-access';
import { websitePreflight, websiteRoute } from '@/server/cors';
import { getDatabase } from '@/server/db';
import { clientIp, HttpError, readJson } from '@/server/http';
import { CheckoutAlreadyStartedError, startCheckout } from '@/server/services/orders';
import { websiteUrl } from '@/server/utils/newsletter';
import { initializePayment, paystackSettings } from '@/server/utils/paystack';

// Per visitor IP: plenty for real buyers, slows down abuse.
const attempts = createAttemptLimiter({ maxAttempts: 10, windowMs: 10 * 60 * 1000 });

/**
 * Website checkout: checks the basket against the database, saves a pending
 * order and returns Paystack's payment page. Prices always come from the
 * database; the basket's prices are only used to spot changes.
 *
 * No Turnstile check here (only on the contact and newsletter forms): buyers
 * should not face a puzzle before paying. Abuse is limited by the honeypot,
 * the per-IP limit, server-side price checks and Paystack's own fraud checks;
 * a spam checkout only leaves an unpaid pending order.
 */
export const POST = websiteRoute(async (request) => {
  const parsed = basketCheckoutRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'Please check your details and basket.');
  const input = parsed.data;
  // Honeypot: real visitors never fill the hidden "website" field.
  if (input.website) throw new HttpError(400, 'Please check your details and basket.');

  const ip = clientIp(request);
  if (attempts.isBlocked(ip)) throw new HttpError(429, 'Too many checkout attempts. Please try again in a few minutes.');
  attempts.record(ip);

  const { mode } = paystackSettings();
  try {
    const result = await startCheckout(getDatabase(), input, {
      mode,
      websiteUrl: websiteUrl(),
      initialize: (payment) => initializePayment(payment),
    });
    return Response.json(result);
  } catch (error) {
    if (error instanceof CheckoutAlreadyStartedError) {
      // The website reads data.reference and shows that checkout's status instead of paying twice.
      return Response.json({ statusCode: 409, statusMessage: error.statusMessage, data: { reference: error.reference } }, { status: 409 });
    }
    throw error;
  }
});

export const OPTIONS = websitePreflight;
