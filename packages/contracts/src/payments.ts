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
