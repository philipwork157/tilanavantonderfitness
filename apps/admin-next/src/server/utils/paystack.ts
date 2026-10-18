import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { serverConfig } from '../config';
import { HttpError } from '../http';

/*
 * Paystack, server side only. The buyer pays on Paystack's own page
 * (transaction/initialize → authorization_url); we never see card details.
 * A payment only counts after transaction/verify confirms it here.
 */

const API = 'https://api.paystack.co';

export type PaystackMode = 'test' | 'live';

/** The secret key and mode, checked against each other so a live key is never used by mistake. */
export function paystackSettings(): { secretKey: string; mode: PaystackMode } {
  const { paystackSecretKey: secretKey, paystackMode } = serverConfig();
  if (!secretKey || (paystackMode !== 'test' && paystackMode !== 'live')) {
    throw new HttpError(503, 'Online payments are not available right now. Please try again later.');
  }
  const keyMode = secretKey.startsWith('sk_live_') ? 'live' : secretKey.startsWith('sk_test_') ? 'test' : null;
  if (keyMode !== paystackMode) {
    throw new HttpError(503, 'Online payments are not available right now. Please try again later.');
  }
  return { secretKey, mode: paystackMode };
}

async function call<T>(path: string, init: RequestInit, fetcher: typeof fetch): Promise<T> {
  const { secretKey } = paystackSettings();
  let response: Response;
  try {
    response = await fetcher(`${API}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${secretKey}`, 'content-type': 'application/json', accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new PaystackError('Paystack could not be reached.', { cause: error });
  }
  const body = await response.json().catch(() => null) as { status?: boolean; message?: string; data?: unknown } | null;
  if (!response.ok || !body?.status) {
    throw new PaystackError(`Paystack ${path.split('/').slice(0, 3).join('/')} failed (HTTP ${response.status}): ${body?.message ?? 'no message'}`, {
      // Paystack answers 400/404 "Transaction reference not found" for a payment page nobody used.
      notFound: (response.status === 400 || response.status === 404) && /not found/i.test(body?.message ?? ''),
    });
  }
  return body.data as T;
}

export class PaystackError extends Error {
  /** Paystack has no such transaction (it was never paid or even opened). */
  readonly notFound: boolean;
  constructor(message: string, options: ErrorOptions & { notFound?: boolean } = {}) {
    super(message, options);
    this.notFound = options.notFound ?? false;
  }
}

export interface StartPayment {
  email: string;
  amountCents: number;
  reference: string;
  callbackUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  /** Shown in Tilana's Paystack dashboard next to the payment, e.g. order number and programs. */
  details?: { label: string; value: string }[];
}

/** Creates the Paystack payment page for an order. Amount in cents (ZAR subunits). */
export async function initializePayment(input: StartPayment, fetcher: typeof fetch = fetch): Promise<{ authorizationUrl: string }> {
  const data = await call<{ authorization_url?: string; reference?: string }>('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      amount: input.amountCents,
      currency: 'ZAR',
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: {
        ...input.metadata,
        cancel_action: input.cancelUrl,
        custom_fields: (input.details ?? []).map(({ label, value }) => ({
          display_name: label,
          variable_name: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          value,
        })),
      },
    }),
  }, fetcher);
  if (!data.authorization_url?.startsWith('https://') || data.reference !== input.reference) {
    throw new PaystackError('Paystack returned an unexpected payment page.');
  }
  return { authorizationUrl: data.authorization_url };
}

export interface VerifiedPayment {
  /** success, failed, abandoned, ongoing, pending, reversed, ... */
  status: string;
  reference: string;
  /** What was charged. Higher than requested when the buyer pays Paystack's fee. */
  amountCents: number;
  /** What we asked for (Paystack's requested_amount; the charged amount if it is missing). */
  requestedAmountCents: number;
  /** Paystack's fee for this payment, in cents, or null when Paystack does not say. */
  feeCents: number | null;
  currency: string;
  mode: string;
  transactionId: string;
  channel: string | null;
  paidAt: Date | null;
}

/** Asks Paystack for the real state of a payment. */
export async function verifyPayment(reference: string, fetcher: typeof fetch = fetch): Promise<VerifiedPayment> {
  const data = await call<{
    status?: string; reference?: string; amount?: number; requested_amount?: number; fees?: number | null;
    currency?: string; domain?: string; id?: number | string; channel?: string; paid_at?: string | null;
  }>(`/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' }, fetcher);
  return {
    status: String(data.status ?? ''),
    reference: String(data.reference ?? ''),
    amountCents: Number(data.amount ?? NaN),
    requestedAmountCents: Number(data.requested_amount ?? data.amount ?? NaN),
    feeCents: typeof data.fees === 'number' && Number.isInteger(data.fees) && data.fees >= 0 ? data.fees : null,
    currency: String(data.currency ?? ''),
    mode: String(data.domain ?? ''),
    transactionId: String(data.id ?? ''),
    channel: data.channel ?? null,
    paidAt: data.paid_at ? new Date(data.paid_at) : null,
  };
}

/** Webhook check: Paystack signs the raw body with HMAC-SHA512 of the secret key. */
export function isValidPaystackSignature(rawBody: string, signature: string | null, secretKey: string): boolean {
  // No key yet (payments not set up): accept nothing, or anyone could sign with an empty key.
  if (!secretKey) return false;
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac('sha512', secretKey).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

/* ── Refunds ── */

/** Paystack's refund states; "processed" means the money is on its way back. */
export type RefundState = 'pending' | 'processing' | 'needs-attention' | 'failed' | 'processed' | string;

export interface PaystackRefund {
  id: string;
  status: RefundState;
  amountCents: number;
}

const toRefund = (data: { id?: number | string; status?: string; amount?: number }): PaystackRefund => ({
  id: String(data.id ?? ''),
  status: String(data.status ?? ''),
  amountCents: Number(data.amount ?? NaN),
});

/**
 * Asks Paystack to refund a whole payment. Refunds are not instant: Paystack
 * answers "pending" and later confirms with a refund.processed webhook.
 */
export async function createRefund(input: { transactionId: string; reason: string }, fetcher: typeof fetch = fetch): Promise<PaystackRefund> {
  const data = await call<{ id?: number; status?: string; amount?: number }>('/refund', {
    method: 'POST',
    body: JSON.stringify({ transaction: input.transactionId, merchant_note: input.reason.slice(0, 300) }),
  }, fetcher);
  return toRefund(data);
}

/** The current state of a refund, for refunds whose webhook did not arrive. */
export async function fetchRefund(id: string, fetcher: typeof fetch = fetch): Promise<PaystackRefund> {
  return toRefund(await call<{ id?: number; status?: string; amount?: number }>(`/refund/${encodeURIComponent(id)}`, { method: 'GET' }, fetcher));
}
