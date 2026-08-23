import { z } from 'zod';
import { programmeCatalogByKey } from './programs';

export const contactInterestValues = [
  'move',
  'strong',
  'nourish',
  'reconnect',
  'one-on-one',
  'general',
] as const;

export const contactInterestSchema = z.enum(contactInterestValues);

export type ContactInterest = z.infer<typeof contactInterestSchema>;

/** Shared display labels used by the public form, admin portal, and notifications. */
export const contactInterestLabels = {
  strong: `${programmeCatalogByKey['strong-volume-1'].volumeName} · Coming soon`,
  move: programmeCatalogByKey['move-volume-1'].volumeName,
  nourish: programmeCatalogByKey['nourish-volume-1'].volumeName,
  reconnect: programmeCatalogByKey['reconnect-volume-1'].volumeName,
  'one-on-one': 'One-on-one training',
  general: 'General question',
} as const satisfies Record<ContactInterest, string>;

export const contactInterestOptions = contactInterestValues.map((value) => ({
  value,
  label: contactInterestLabels[value],
}));

export type ContactFormField =
  | 'name'
  | 'email'
  | 'interest'
  | 'message'
  | 'consent'
  | 'turnstileToken';

/** Human-friendly validation copy shared by browser and API responses. */
export const contactValidationMessages = {
  name: 'Please enter your full name (at least 2 characters).',
  email: 'Please enter a valid email address.',
  interest: 'Please choose what you are interested in.',
  message: 'Please tell Tilana a little more (at least 10 characters).',
  consent: 'Please accept the privacy agreement before sending.',
  turnstileToken: 'Please complete the security check.',
} as const satisfies Record<ContactFormField, string>;

/** Browser-to-Nuxt contract for the public contact form. */
export const contactFormRequestSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  interest: contactInterestSchema,
  message: z.string().trim().min(10).max(3000),
  consent: z.literal(true),
  website: z.string().max(200).default(''),
  turnstileToken: z.string().max(2048).default(''),
});

export const contactFormResponseSchema = z.object({
  ok: z.literal(true),
});

export type ContactFormRequest = z.infer<typeof contactFormRequestSchema>;
export type ContactFormResponse = z.infer<typeof contactFormResponseSchema>;
