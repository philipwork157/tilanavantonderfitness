import { z } from 'zod';
import { catalogueSlugSchema } from './catalogue';

/** Unpredictable browser intent token. It is external text, not an application ID. */
export const checkoutIntentKeySchema = z.string().uuid().transform(value => value.toLowerCase());

export const basketCheckoutItemSchema = z.object({
  volumeSlug: catalogueSlugSchema,
  expectedPriceCents: z.number().int().positive().max(100_000_000),
}).strict();

export const basketCheckoutRequestSchema = z.object({
  idempotencyKey: checkoutIntentKeySchema,
  items: z.array(basketCheckoutItemSchema).min(1).max(10),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(30).default(''),
  consent: z.literal(true),
  website: z.string().max(200).default(''),
  turnstileToken: z.string().max(2048).default(''),
}).superRefine((value, context) => {
  const seen = new Set<string>();
  value.items.forEach((item, index) => {
    if (seen.has(item.volumeSlug)) {
      context.addIssue({
        code: 'custom',
        path: ['items', index, 'volumeSlug'],
        message: 'Each programme can only be purchased once per order.',
      });
    }
    seen.add(item.volumeSlug);
  });
});

export const checkoutResponseSchema = z.object({
  authorizationUrl: z.string().url(),
  reference: z.string(),
});

export const checkoutStatusResponseSchema = z.object({
  status: z.enum(['pending', 'succeeded', 'failed', 'abandoned', 'reversed', 'partially_refunded', 'refunded']),
  orderNumber: z.string(),
  deliveryStatus: z.enum(['pending', 'retrying', 'sent', 'canceled', 'unavailable']).optional(),
});

export type BasketCheckoutRequest = z.infer<typeof basketCheckoutRequestSchema>;

/** Canonical purchase identity excludes rotating anti-abuse tokens and item order. */
export function serializeCheckoutIntent(input: Pick<BasketCheckoutRequest, 'items' | 'firstName' | 'lastName' | 'email' | 'phone' | 'consent'>): string {
  return JSON.stringify({
    items: [...input.items].sort((left, right) => left.volumeSlug < right.volumeSlug ? -1 : left.volumeSlug > right.volumeSlug ? 1 : 0),
    firstName: input.firstName.trim(), lastName: input.lastName.trim(),
    email: input.email.trim().toLowerCase(), phone: input.phone.trim(), consent: input.consent,
  });
}
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
export type CheckoutStatusResponse = z.infer<typeof checkoutStatusResponseSchema>;
