import { z } from 'zod';

export const newsletterValidationMessages = {
  email: 'Please enter a valid email address.',
  consent: 'Please agree to receive the newsletter.',
  turnstileToken: 'Please complete the security check.',
} as const;

export type NewsletterFormField = keyof typeof newsletterValidationMessages;

export const newsletterSubscribeRequestSchema = z.object({
  email: z.string().trim().email().max(254),
  consent: z.literal(true),
  source: z.string().trim().min(1).max(80).default('website-footer'),
  website: z.string().max(200).default(''),
  turnstileToken: z.string().max(2048).default(''),
});

export const newsletterSubscribeResponseSchema = z.object({ ok: z.literal(true) });
export const newsletterTokenSchema = z.string().min(32).max(256);

export type NewsletterSubscribeRequest = z.infer<typeof newsletterSubscribeRequestSchema>;
export type NewsletterSubscribeResponse = z.infer<typeof newsletterSubscribeResponseSchema>;
