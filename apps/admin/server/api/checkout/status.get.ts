import { getPaystackCheckoutStatus, verifyPaystackCheckout } from '@server/services/paystack';
import { applyContactCors } from '@server/utils/contact-security';
import { abusePolicies, claimSharedAllowance, enforceSharedLimit } from '@server/services/abuse-controls';
import { getTrustedRequestIp } from '@server/utils/request-identity';

export default defineEventHandler(async (event) => {
  applyContactCors(event);
  await enforceSharedLimit(
    getTrustedRequestIp(event),
    abusePolicies.statusIp,
    'Too many checkout status requests. Please try again later.',
  );
  const reference = String(getQuery(event).reference || '');
  if (!/^[A-Za-z0-9.=-]{10,160}$/.test(reference)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payment reference.' });
  }
  let result = await getPaystackCheckoutStatus(reference);
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Payment was not found.' });
  if (result.status === 'pending') {
    try {
      if (await claimSharedAllowance(reference, abusePolicies.verificationReference)) {
        await verifyPaystackCheckout(reference);
        result = await getPaystackCheckoutStatus(reference) ?? result;
      }
    } catch (error) {
      console.error('Paystack callback verification is still pending.', error instanceof Error ? error.message : error);
    }
  }
  return result;
});
