import type { CheckoutStatusResponse } from '@tilana/contracts/checkout';
import { readCheckoutStatus } from './checkout-status';

/** Presentation follows verified server status, never the provider redirect alone. */
export function checkoutStatusMessage(result: CheckoutStatusResponse) {
  const messages = {
    pending: ['Payment is still processing', 'Confirmation can take a moment. Please check again shortly or contact Tilana with the payment reference below.'],
    succeeded: ['Payment received', `Thank you. Your order${result.orderNumber ? ` ${result.orderNumber}` : ''} is confirmed. Use your purchase email address to access your programs.`],
    partially_refunded: ['Payment partially refunded', 'Your payment was received and a partial refund has been recorded. Access to the programs from this order remains active. Use your purchase email address to sign in. Contact Tilana with the payment reference below for refund questions.'],
    refunded: ['Payment refunded', 'Your payment was received and a full refund has been recorded. Access granted by this order has been removed. Any access from other valid purchases is unaffected. Contact Tilana with the payment reference below for refund questions.'],
    reversed: ['Payment reversed', 'The payment has been reversed and access granted by this order has been removed. Any access from other valid purchases is unaffected. Contact Tilana with the payment reference below before starting another checkout.'],
    failed: ['Payment not completed', 'The payment was unsuccessful. You can return to the programs page and try again. If you believe you were charged, contact Tilana with the payment reference below.'],
    abandoned: ['Checkout not completed', 'This checkout was not completed. You can return to the programs page when you are ready. If you believe you were charged, contact Tilana with the payment reference below.'],
  } satisfies Record<CheckoutStatusResponse['status'], [string, string]>;
  const [heading, message] = messages[result.status];
  return { heading, message, access: result.status === 'succeeded' || result.status === 'partially_refunded' };
}

/** Poll bounded, uncached evidence; invalid HTTP/JSON remains uncertain, not failed. */
export async function confirmCheckoutStatus(apiUrl: string, reference: string, dependencies: {
  fetch: typeof fetch;
  pause: () => Promise<void>;
  clearPaid: (reference: string) => Promise<void>;
  retireIntent: (reference: string) => Promise<void>;
}) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const url = new URL(apiUrl);
      url.searchParams.set('reference', reference);
      const response = await dependencies.fetch(url.toString(), { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      const result = await readCheckoutStatus(response);
      if (result.status !== 'pending') {
        // Partial refunds retain the successful purchase's basket/access semantics.
        if (result.status === 'succeeded' || result.status === 'partially_refunded') await dependencies.clearPaid(reference);
        else await dependencies.retireIntent(reference);
        return checkoutStatusMessage(result);
      }
    } catch {
      // Unavailable evidence does not release a reserved checkout intent.
    }
    if (attempt < 9) await dependencies.pause();
  }
  return checkoutStatusMessage({ status: 'pending', orderNumber: '' });
}
