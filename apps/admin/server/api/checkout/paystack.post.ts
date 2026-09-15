import { checkoutRequestSchema } from '@tilana/contracts/checkout';
import { initializePaystackCheckout } from '../../services/paystack';
import { prepareCheckoutRequest } from '../../utils/checkout-request';

export default defineEventHandler(async (event) => {
  const body = await prepareCheckoutRequest(
    event,
    checkoutRequestSchema,
    'Please check your checkout details and try again.',
  );
  return initializePaystackCheckout(body);
});
