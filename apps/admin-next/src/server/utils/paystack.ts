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
    throw new PaystackError(`Paystack ${path.split('/').slice(0, 3).join('/')} failed (HTTP ${response.status}): ${body?.message ?? 'no message'}`);
  }
  return body.data as T;
}

export class PaystackError extends Error {}

export interface StartPayment {
  email: string;
  amountCents: number;
  reference: string;
  callbackUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
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
      metadata: { ...input.metadata, cancel_action: input.cancelUrl },
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
  amountCents: number;
  currency: string;
  mode: string;
  transactionId: string;
  channel: string | null;
  paidAt: Date | null;
}

/** Asks Paystack for the real state of a payment. */
export async function verifyPayment(reference: string, fetcher: typeof fetch = fetch): Promise<VerifiedPayment> {
  const data = await call<{
    status?: string; reference?: string; amount?: number; currency?: string; domain?: string;
    id?: number | string; channel?: string; paid_at?: string | null;
  }>(`/transaction/verify/${encodeURIComponent(reference)}`, { method: 'GET' }, fetcher);
  return {
    status: String(data.status ?? ''),
    reference: String(data.reference ?? ''),
    amountCents: Number(data.amount ?? NaN),
    currency: String(data.currency ?? ''),
    mode: String(data.domain ?? ''),
    transactionId: String(data.id ?? ''),
    channel: data.channel ?? null,
    paidAt: data.paid_at ? new Date(data.paid_at) : null,
  };
}

/** Webhook check: Paystack signs the raw body with HMAC-SHA512 of the secret key. */
export function isValidPaystackSignature(rawBody: string, signature: string | null, secretKey: string): boolean {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac('sha512', secretKey).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
