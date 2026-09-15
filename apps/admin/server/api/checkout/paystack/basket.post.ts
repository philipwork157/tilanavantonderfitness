import { basketCheckoutRequestSchema } from '@tilana/contracts/checkout';
import { initializePaystackBasketCheckout } from '../../../services/paystack';
import { prepareCheckoutRequest } from '../../../utils/checkout-request';

export default defineEventHandler(async (event) => {
  const body = await prepareCheckoutRequest(
    event,
    basketCheckoutRequestSchema,
    'Please check your basket and checkout details.',
  );
  return initializePaystackBasketCheckout(body);
});
