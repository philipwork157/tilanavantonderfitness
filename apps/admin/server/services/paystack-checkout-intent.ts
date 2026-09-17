import { createHash } from 'node:crypto';
import { paystackInitializationResponseSchema } from '@tilana/contracts/payments';
import { serializeCheckoutIntent, type BasketCheckoutRequest, type CheckoutResponse } from '@tilana/contracts/checkout';
import type { Database } from '@tilana/db/server';
import { orders, payments } from '@tilana/db/schema';
import { and, eq } from 'drizzle-orm';

/** Hash intent tokens and normalized request identity without storing browser tokens. */
export function hashCheckoutIntent(input: BasketCheckoutRequest) {
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  return { keyHash: hash(input.idempotencyKey.toLowerCase()), requestHash: hash(serializeCheckoutIntent(input)) };
}

interface ReservedCheckout {
  paymentId: number;
  orderId: number;
  reference: string;
  email: string;
  totalCents: number;
  volumeIds: (number | null)[];
}

/** A settled/rejected attempt returns to its existing status screen, never a new charge. */
function completionResponse(callbackUrl: string, reference: string): CheckoutResponse {
  const url = new URL(callbackUrl);
  url.searchParams.set('reference', reference);
  return { reference, authorizationUrl: url.toString() };
}

/** Persist a claim before the provider call; concurrent requests share one reference. */
export async function resolvePaystackCheckout(
  database: Database,
  checkout: ReservedCheckout,
  config: { secretKey: string; callbackUrl: string },
  verify: (reference: string) => Promise<void>,
): Promise<CheckoutResponse> {
  const [claimed] = await database.update(payments).set({ providerStatus: 'initializing', updatedAt: new Date() })
    .where(and(eq(payments.id, checkout.paymentId), eq(payments.status, 'pending'), eq(payments.providerStatus, 'initialization_reserved')))
    .returning({ id: payments.id });

  if (!claimed) {
    const deadline = Date.now() + 12_000;
    while (true) {
      const [payment] = await database.select().from(payments).where(eq(payments.id, checkout.paymentId)).limit(1);
      if (!payment) throw new Error('The reserved checkout could not be found.');
      if (payment.status !== 'pending') return completionResponse(config.callbackUrl, checkout.reference);
      if (payment.checkoutUrl) return { reference: checkout.reference, authorizationUrl: payment.checkoutUrl };
      const uncertain = payment.providerStatus === 'initialization_uncertain'
        || (payment.providerStatus === 'initializing' && Date.now() - payment.updatedAt.getTime() > 15_000);
      if (uncertain) {
        // Recover a confirmed charge through the same validated fulfillment path.
        // Never initialize a second reference after an ambiguous provider result.
        try { await verify(checkout.reference); } catch { /* Provider unavailable or reference not yet visible. */ }
        const [reconciled] = await database.select({ status: payments.status }).from(payments).where(eq(payments.id, checkout.paymentId));
        if (reconciled && reconciled.status !== 'pending') return completionResponse(config.callbackUrl, checkout.reference);
        throw createError({ statusCode: 409, statusMessage: 'This checkout needs confirmation. Please contact us before starting another payment.', data: { reference: checkout.reference } });
      }
      if (Date.now() >= deadline) {
        throw createError({ statusCode: 409, statusMessage: 'This checkout is still opening. Please retry the same checkout shortly.', data: { reference: checkout.reference } });
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  let raw: unknown;
  try {
    raw = await $fetch<unknown>('https://api.paystack.co/transaction/initialize', {
      method: 'POST', timeout: 10_000, retry: 0,
      headers: { Authorization: `Bearer ${config.secretKey}` },
      body: {
        email: checkout.email, amount: String(checkout.totalCents), currency: 'ZAR',
        reference: checkout.reference, callback_url: config.callbackUrl,
        metadata: { order_id: checkout.orderId, payment_id: checkout.paymentId,
          program_volume_ids: checkout.volumeIds, item_count: checkout.volumeIds.length },
      },
    });
  } catch {
    raw = null;
  }
  const parsed = paystackInitializationResponseSchema.safeParse(raw);
  if (!parsed.success || parsed.data.data.reference !== checkout.reference) {
    const rejected = !!raw && typeof raw === 'object' && 'status' in raw && raw.status === false;
    const changed = await database.transaction(async transaction => {
      const [updated] = await transaction.update(payments).set({
        ...(rejected && { status: 'failed' as const }),
        providerStatus: rejected ? 'initialization_rejected' : 'initialization_uncertain',
        failureMessage: rejected ? 'Provider rejected initialization.' : 'Provider initialization requires confirmation.',
        updatedAt: new Date(),
      }).where(and(eq(payments.id, checkout.paymentId), eq(payments.status, 'pending'))).returning({ id: payments.id });
      if (updated && rejected) await transaction.update(orders).set({ status: 'cancelled', updatedAt: new Date() })
        .where(and(eq(orders.id, checkout.orderId), eq(orders.status, 'pending')));
      return !!updated;
    });
    if (!changed) return completionResponse(config.callbackUrl, checkout.reference);
    throw createError({ statusCode: 502, statusMessage: rejected
      ? 'Paystack rejected this checkout. Please contact us if you need help.'
      : 'Payment opening could not be confirmed. Retry this checkout; do not start another payment.', data: { reference: checkout.reference } });
  }
  const response = parsed.data.data;
  // Metadata must not overwrite a success/refund webhook that won the race.
  const [updated] = await database.update(payments).set({
    accessCode: response.access_code, checkoutUrl: response.authorization_url,
    providerStatus: 'initialized', updatedAt: new Date(),
  }).where(and(eq(payments.id, checkout.paymentId), eq(payments.status, 'pending'))).returning({ id: payments.id });
  return updated ? { reference: checkout.reference, authorizationUrl: response.authorization_url }
    : completionResponse(config.callbackUrl, checkout.reference);
}
