import { checkoutRequestSchema } from '@tilana/contracts/checkout';
import { initializePaystackCheckout } from '../../services/paystack';
import {
  applyContactCors,
  enforceContactRateLimit,
  getContactRequestIp,
  verifyContactTurnstile,
} from '../../utils/contact-security';

export default defineEventHandler(async (event) => {
  applyContactCors(event);
  const parsed = checkoutRequestSchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Please check your checkout details and try again.' });
  }

  if (parsed.data.website) {
    throw createError({ statusCode: 400, statusMessage: 'Checkout could not be started.' });
  }

  const ip = getContactRequestIp(event);
  await enforceContactRateLimit(ip, 'checkout');
  await verifyContactTurnstile(parsed.data.turnstileToken, ip, 'checkout');
  return initializePaystackCheckout(parsed.data);
});
