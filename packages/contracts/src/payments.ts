import { z } from 'zod';

/** Validate provider evidence before it can change a payment or its order. */
export const paystackVerificationResponseSchema = z.object({
  status: z.literal(true),
  message: z.string(),
  data: z.object({
    reference: z.string().min(1),
    amount: z.number().int().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    domain: z.enum(['test', 'live']),
    status: z.string().min(1),
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
