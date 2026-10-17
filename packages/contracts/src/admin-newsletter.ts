import { z } from 'zod';

export const NEWSLETTER_SUBSCRIBER_VIEWS = ['subscribed', 'pending', 'unsubscribed', 'suppressed'] as const;
export const newsletterSubscriberViewSchema = z.enum(NEWSLETTER_SUBSCRIBER_VIEWS).default('subscribed');

export const createNewsletterCampaignRequestSchema = z.object({
  blogPostId: z.number().int().positive(),
});

/** What Tilana edits on a campaign before sending. */
export const newsletterCampaignInputSchema = z.object({
  blogPostId: z.number().int().positive({ message: 'Choose a blog post.' }),
  subject: z.string().trim().min(3, 'Add a subject line.').max(150),
  previewText: z.string().trim().max(200).default(''),
  introduction: z.string().trim().max(1000).default(''),
});

/** Sending repeats the number Tilana reviewed, so a changed list is caught. */
export const sendNewsletterCampaignRequestSchema = z.object({
  recipientCount: z.number().int().positive(),
});

export type NewsletterSubscriberView = z.infer<typeof newsletterSubscriberViewSchema>;
export type NewsletterCampaignInput = z.infer<typeof newsletterCampaignInputSchema>;
