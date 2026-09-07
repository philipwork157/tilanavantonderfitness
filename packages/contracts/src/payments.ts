import { z } from 'zod';

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
