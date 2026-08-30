import { z } from 'zod';

export { newsletterValidationMessages, type NewsletterFormField } from './newsletter.messages';

export const newsletterSubscribeRequestSchema = z.object({
  email: z.string().trim().email().max(254),
  consent: z.literal(true),
  source: z.string().trim().min(1).max(80).default('website-footer'),
  website: z.string().max(200).default(''),
  turnstileToken: z.string().max(2048).default(''),
});

export const newsletterSubscribeResponseSchema = z.object({ ok: z.literal(true) });
export const newsletterTokenSchema = z.string().min(32).max(256);

export const newsletterCampaignInputSchema = z.object({
  subject: z.string().trim().min(3).max(150),
  previewText: z.string().trim().max(200).default(''),
  blogTitle: z.string().trim().min(2).max(160),
  introduction: z.string().trim().min(10).max(1_200),
  blogUrl: z.string().trim().url().max(500),
});

export const newsletterCampaignIdSchema = z.string().uuid();

export type NewsletterSubscribeRequest = z.infer<typeof newsletterSubscribeRequestSchema>;
export type NewsletterSubscribeResponse = z.infer<typeof newsletterSubscribeResponseSchema>;
export type NewsletterCampaignInput = z.infer<typeof newsletterCampaignInputSchema>;
