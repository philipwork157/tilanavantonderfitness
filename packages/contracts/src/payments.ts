import { z } from 'zod';

/** Accept only Paystack's hosted HTTPS checkout URL and complete attempt evidence. */
export const paystackInitializationResponseSchema = z.object({
  status: z.literal(true),
  data: z.object({
    reference: z.string().min(1), access_code: z.string().min(1),
    authorization_url: z.string().url().refine((value) => {
      const url = new URL(value);
      return url.protocol === 'https:' && url.hostname === 'checkout.paystack.com'
        && !url.username && !url.password && !url.port;
    }),
  }),
});

/** Validate provider evidence before it can change a payment or its order. */
export const paystackVerificationResponseSchema = z.object({
  status: z.literal(true),
  message: z.string(),
  data: z.object({
    reference: z.string().min(1),
    amount: z.number().int().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    domain: z.enum(['test', 'live']),
    // Keep provider states distinct from internal checkout claim markers.
    status: z.enum(['abandoned', 'failed', 'ongoing', 'pending', 'processing', 'queued', 'reversed', 'success']),
  }).passthrough(),
});

export const adminPaymentRefundRequestSchema = z.object({
  amountCents: z
    .number()
    .int('The refund amount must be a whole number of cents.')
    .positive('Enter a refund amount greater than zero.')
    .max(10_000_000, 'The refund amount is too large.'),
  customerNote: z.string().trim().max(240).optional().default(''),
  merchantNote: z.string().trim().max(500).optional().default(''),
});

export type AdminPaymentRefundRequest = z.infer<typeof adminPaymentRefundRequestSchema>;

const providerId = z.union([z.string().regex(/^[A-Za-z0-9.=-]+$/).max(100), z.number().int().positive()]).transform(String);
/** Project only evidence needed for reconciliation, not card or customer provider data. */
export const paystackRecoveryRefundSchema = z.object({
  id: providerId, domain: z.enum(['test', 'live']), transaction: providerId,
  amount: z.number().int().positive(), currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(['pending', 'processing', 'processed', 'failed', 'needs-attention']),
  refund_reference: providerId.nullish(),
});
export const paystackRecoveryDisputeSchema = z.object({
  id: providerId, domain: z.enum(['test', 'live']), status: z.string().min(1).max(100),
  resolution: z.string().max(100).nullish(), refund_amount: z.number().int().positive().nullish(),
  transaction: z.object({
    id: providerId, reference: z.string().min(1), domain: z.enum(['test', 'live']),
    amount: z.number().int().positive(), currency: z.string().regex(/^[A-Z]{3}$/),
  }),
});
export const paystackRecoveryRefundListSchema = z.object({ status: z.literal(true), data: z.array(paystackRecoveryRefundSchema).max(100) });
export const paystackRecoveryDisputeListSchema = z.object({ status: z.literal(true), data: z.array(paystackRecoveryDisputeSchema).max(100) });
/** Operators may request fresh evidence or replay stored evidence, never supply provider payloads. */
export const adminPaymentRecoveryRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reconcile'), paymentId: z.number().int().positive() }).strict(),
  z.object({ action: z.literal('replay'), eventId: z.number().int().positive() }).strict(),
  z.object({ action: z.literal('acknowledge'), paymentId: z.number().int().positive() }).strict(),
]);
export const paymentRecoveryAlertEmailSchema = z.string().email();
