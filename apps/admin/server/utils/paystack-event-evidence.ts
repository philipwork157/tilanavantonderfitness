import { createHash } from 'node:crypto';

const RETENTION_DAYS = 30;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function pick(source: Record<string, unknown>, keys: readonly string[]) {
  return Object.fromEntries(keys.filter(key => source[key] !== undefined).map(key => [key, source[key]]));
}

/** Persist only the fields needed to replay and reconcile a financial event. */
export function sanitizePaystackEvent(payload: Record<string, unknown>) {
  const event = typeof payload.event === 'string' ? payload.event : 'unknown';
  const data = record(payload.data);
  if (event === 'charge.success') {
    return { event, data: pick(data, [
      'id', 'reference', 'status', 'amount', 'currency', 'fees', 'channel',
      'gateway_response', 'paid_at', 'domain',
    ]) };
  }
  if (event.startsWith('refund.')) {
    return { event, data: pick(data, [
      'id', 'transaction_reference', 'refund_reference', 'status', 'amount',
      'currency', 'domain', 'refunded_at', 'expected_at',
    ]) };
  }
  if (event.startsWith('charge.dispute.')) {
    return { event, data: {
      ...pick(data, ['id', 'domain', 'status', 'resolution', 'refund_amount']),
      transaction: pick(record(data.transaction), ['id', 'reference', 'domain', 'amount', 'currency']),
    } };
  }
  return { event, data: pick(data, ['id', 'reference', 'status', 'amount', 'currency', 'domain']) };
}

export function digestEventPayload(payload: unknown) {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function paymentEventExpiry(now = new Date()) {
  return new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60_000);
}

export const redactedPaymentEventPayload = { redacted: true } as const;
