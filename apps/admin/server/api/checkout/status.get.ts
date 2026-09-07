import { getPaystackCheckoutStatus, verifyPaystackCheckout } from '../../services/paystack';
import { applyContactCors } from '../../utils/contact-security';

export default defineEventHandler(async (event) => {
  applyContactCors(event);
  const reference = String(getQuery(event).reference || '');
  if (!/^[A-Za-z0-9.=-]{10,160}$/.test(reference)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payment reference.' });
  }
  let result = await getPaystackCheckoutStatus(reference);
  if (!result) throw createError({ statusCode: 404, statusMessage: 'Payment was not found.' });
  if (result.status === 'pending') {
    try {
      await verifyPaystackCheckout(reference);
      result = await getPaystackCheckoutStatus(reference) ?? result;
    } catch (error) {
      console.error('Paystack callback verification is still pending.', error instanceof Error ? error.message : error);
    }
  }
  return result;
});
