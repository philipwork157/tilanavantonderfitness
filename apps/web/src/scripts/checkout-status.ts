import { checkoutStatusResponseSchema, type CheckoutStatusResponse } from '@tilana/contracts/checkout';

/** Only a successful, contracted API response can retire a browser payment intent. */
export async function readCheckoutStatus(response: Pick<Response, 'ok' | 'json'>): Promise<CheckoutStatusResponse> {
  const parsed = checkoutStatusResponseSchema.safeParse(await response.json());
  if (!response.ok || !parsed.success) throw new Error('Payment status could not be confirmed.');
  return parsed.data;
}
