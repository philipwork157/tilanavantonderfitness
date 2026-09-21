import { createHash } from 'node:crypto';
import { paymentEvidenceFields as fields } from '@tilana/contracts/payment-evidence';

const RETENTION_DAYS = 30;
const groups = {
  charge: ['id', 'reference', 'status', 'amount', 'currency', 'fees', 'channel', 'paid_at', 'domain'],
  refund: ['id', 'transaction_reference', 'refund_reference', 'status', 'amount', 'currency', 'domain', 'refunded_at', 'expected_at'],
  dispute: ['id', 'domain', 'status', 'resolution', 'refund_amount'],
  transaction: ['id', 'reference', 'domain', 'amount', 'currency'],
} as const;
const required = {
  charge: ['reference', 'status', 'amount', 'currency', 'domain'],
  refund: ['transaction_reference', 'amount', 'currency', 'domain'],
  dispute: ['id', 'domain', 'status'], transaction: ['id', 'reference', 'domain', 'amount', 'currency'],
} as const;
const events = ['charge.success', 'refund.pending', 'refund.processing', 'refund.processed', 'refund.failed',
  'refund.needs-attention', 'charge.dispute.create', 'charge.dispute.remind', 'charge.dispute.resolve'];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Validate retained scalars without coercing, truncating or copying unknown values. */
function project(value: unknown, group: keyof typeof groups) {
  const source = record(value);
  const data: Record<string, unknown> = {};
  let rejected = required[group].some(key => source[key] == null);
  for (const key of groups[group]) {
    if (source[key] === undefined) continue;
    const parsed = fields[key].nullable().safeParse(source[key]);
    if (parsed.success) data[key] = parsed.data;
    else rejected = true;
  }
  return { data, rejected };
}

/** A rejection marker prevents stripped malformed evidence being replayed as valid. */
export function sanitizePaystackEvent(value: unknown): { event: string; data: Record<string, unknown>; evidenceRejected?: true } {
  const payload = record(value);
  const event = typeof payload.event === 'string' && events.includes(payload.event) ? payload.event : 'unknown';
  if (event === 'unknown') return { event, data: {} };
  const group = event === 'charge.success' ? 'charge' : event.startsWith('refund.') ? 'refund' : 'dispute';
  const result = project(payload.data, group);
  if (group === 'dispute') {
    const nested = project(record(payload.data).transaction, 'transaction');
    result.data.transaction = nested.data;
    result.rejected ||= nested.rejected;
  }
  // Free-text gateway responses, customer, authorization and metadata never persist.
  return { event, data: result.data, ...((result.rejected || payload.evidenceRejected === true) && { evidenceRejected: true as const }) };
}

export function digestEventPayload(payload: unknown) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function paymentEventExpiry(now = new Date()) {
  return new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60_000);
}

export const redactedPaymentEventPayload = { redacted: true } as const;
