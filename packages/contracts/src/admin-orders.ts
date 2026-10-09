import { z } from 'zod';

/** Admin work on website orders. */

/** Readable order numbers: "TV-" and six letters/digits without look-alikes (no I, O, 0, 1). */
export const orderNumberSchema = z.string().trim().toUpperCase().regex(/^TV-[A-HJ-NP-Z2-9]{6}$/);

/** "Email the PDFs again": empty email = the buyer's address on the order. */
export const resendOrderRequestSchema = z.object({
  email: z.union([z.literal(''), z.string().trim().toLowerCase().email().max(254)]).default(''),
});

export type ResendOrderRequest = z.infer<typeof resendOrderRequestSchema>;

/** Refund a whole paid order. The reason is kept on the order and sent to Paystack as a note. */
export const refundOrderRequestSchema = z.object({
  reason: z.string().trim().min(3, 'Please give a short reason.').max(300),
});

export type RefundOrderRequest = z.infer<typeof refundOrderRequestSchema>;
