import type { CheckoutStatusResponse } from '@tilana/contracts/checkout';
import { readCheckoutStatus } from './checkout-status';

/** Presentation follows verified server status, never the provider redirect alone. */
export function checkoutStatusMessage(result: CheckoutStatusResponse) {
  const messages = {
    pending: ['Payment is still processing', 'We have not yet confirmed the payment. Please check again shortly. Do not start another payment until this one is confirmed. Contact Tilana with the payment reference below if you need help.'],
    succeeded: ['Payment received', `Thank you. Your order${result.orderNumber ? ` ${result.orderNumber}` : ''} is confirmed. Use your purchase email address to access your programs.`],
    partially_refunded: ['Payment partially refunded', 'Your payment was received and a partial refund has been recorded. Access to the programs from this order remains active. Use your purchase email address to sign in. Contact Tilana with the payment reference below for refund questions.'],
    refunded: ['Payment refunded', 'Your payment was received and a full refund has been recorded. Access granted by this order has been removed. Any access from other valid purchases is unaffected. Contact Tilana with the payment reference below for refund questions.'],
    reversed: ['Payment reversed', 'The payment has been reversed and access granted by this order has been removed. Any access from other valid purchases is unaffected. Contact Tilana with the payment reference below before starting another checkout.'],
    failed: ['Sorry, something went wrong', 'This payment was unsuccessful. Your programs have not been sent and your cart has been kept. You can return to checkout and try again. If your bank shows a charge, contact Tilana with the payment reference below before paying again.'],
    abandoned: ['Sorry, something went wrong', 'This checkout was not completed. Your programs have not been sent and your cart has been kept. You can return to checkout when you are ready. If your bank shows a charge, contact Tilana with the payment reference below before paying again.'],
  } satisfies Record<CheckoutStatusResponse['status'], [string, string]>;
  const [heading, message] = messages[result.status];
  const access = result.status === 'succeeded' || result.status === 'partially_refunded';
  const delivery = result.deliveryStatus === 'sent' ? ' Your program email has been sent. Please check your inbox and spam folder.'
    : result.deliveryStatus === 'retrying' ? ' Your payment is confirmed, but the program email is delayed. We will retry automatically. You can also use Access my programs below.'
    : result.deliveryStatus === 'pending' ? ' We are preparing your program email. You can also use Access my programs below.'
    : result.deliveryStatus === 'canceled' || result.deliveryStatus === 'unavailable' ? ' Program email delivery is unavailable. Please contact Tilana with your payment reference.' : '';
  return { heading, message: message + (access ? delivery : ''), access,
    retry: result.status === 'failed' || result.status === 'abandoned', recheck: result.status === 'pending' };
}

/** Poll bounded, uncached evidence; invalid HTTP/JSON remains uncertain, not failed. */
export async function confirmCheckoutStatus(apiUrl: string, reference: string, dependencies: {
  fetch: typeof fetch;
  pause: () => Promise<void>;
  clearPaid: (reference: string) => Promise<void>;
  retireIntent: (reference: string) => Promise<void>;
}) {
  // Native browser fetch rejects a plain dependency object as its receiver.
  // Invoke it as a function, not dependencies.fetch(...).
  const request = dependencies.fetch;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const url = new URL(apiUrl);
      url.searchParams.set('reference', reference);
      const response = await request(url.toString(), { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      const result = await readCheckoutStatus(response);
      if (result.status !== 'pending') {
        const presentation = checkoutStatusMessage(result);
        // Partial refunds retain the successful purchase's basket/access semantics.
        try {
          if (presentation.access) await dependencies.clearPaid(reference);
          else await dependencies.retireIntent(reference);
        } catch {
          // Browser storage failures cannot turn verified payment truth into uncertainty.
          // Do not offer a new attempt until its previous intent can be safely retired.
          return { ...presentation, retry: false,
            message: `${presentation.message} We could not update your saved checkout. Please contact Tilana before starting another payment.` };
        }
        return presentation;
      }
    } catch {
      // Unavailable evidence does not release a reserved checkout intent.
    }
    if (attempt < 9) await dependencies.pause();
  }
  return checkoutStatusMessage({ status: 'pending', orderNumber: '' });
}
