import { basketCheckoutRequestSchema } from '@tilana/contracts/checkout';
import { initializePaystackBasketCheckout } from '@server/services/paystack';
import { prepareCheckoutRequest } from '@server/utils/checkout-request';

export default defineEventHandler(async (event) => {
  const body = await prepareCheckoutRequest(
    event,
    basketCheckoutRequestSchema,
    'Please check your basket and checkout details.',
  );
  return initializePaystackBasketCheckout(body);
});
