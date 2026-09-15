import { checkoutRequestSchema } from '@tilana/contracts/checkout';
import { initializePaystackCheckout } from '@server/services/paystack';
import { prepareCheckoutRequest } from '@server/utils/checkout-request';

export default defineEventHandler(async (event) => {
  const body = await prepareCheckoutRequest(
    event,
    checkoutRequestSchema,
    'Please check your checkout details and try again.',
  );
  return initializePaystackCheckout(body);
});
