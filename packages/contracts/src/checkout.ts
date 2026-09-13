import { z } from 'zod';
import { catalogueSlugSchema } from '@tilana/contracts/catalogue';

export const checkoutRequestSchema = z.object({
  volumeSlug: catalogueSlugSchema,
  expectedPriceCents: z.number().int().positive(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(30).default(''),
  consent: z.literal(true),
  website: z.string().max(200).default(''),
  turnstileToken: z.string().max(2048).default(''),
});

export const checkoutResponseSchema = z.object({
  authorizationUrl: z.string().url(),
  reference: z.string(),
});

export const checkoutStatusResponseSchema = z.object({
  status: z.enum(['pending', 'succeeded', 'failed', 'abandoned', 'reversed', 'partially_refunded', 'refunded']),
  orderNumber: z.string(),
});

export const customerMagicLinkRequestSchema = z.object({
  email: z.string().trim().email().max(254),
});

export const customerMagicLinkResponseSchema = z.object({ ok: z.literal(true) });

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
export type CheckoutStatusResponse = z.infer<typeof checkoutStatusResponseSchema>;
export type CustomerMagicLinkRequest = z.infer<typeof customerMagicLinkRequestSchema>;
export type CustomerMagicLinkResponse = z.infer<typeof customerMagicLinkResponseSchema>;
