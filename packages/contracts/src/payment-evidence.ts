import { z } from 'zod';

const token = (max: number) => z.string().regex(/^[A-Za-z0-9_.:=+-]+$/).min(1).max(max);
const identifier = z.union([token(100), z.number().int().positive().max(Number.MAX_SAFE_INTEGER)]);
const cents = z.number().int().min(0).max(2147483647);
const date = z.string().max(64).regex(/^\d{4}-\d{2}-\d{2}T[0-9:.+Z-]+$/);

/** Retention types are deliberately bounded and never coerce provider values. */
export const paymentEvidenceFields = {
  id: identifier, reference: token(240), transaction_reference: token(240), refund_reference: identifier,
  status: token(100), resolution: token(100), amount: cents, fees: cents, refund_amount: cents,
  currency: z.string().regex(/^[A-Z]{3}$/), domain: z.enum(['test', 'live']), channel: token(50),
  paid_at: date, refunded_at: date, expected_at: date,
};
