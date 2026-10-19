import { z } from 'zod';
import { programCatalogByKey } from './programs';

export const contactInterestValues = [
  'move',
  'intermediate',
  'strong',
  'nourish',
  'reconnect',
  'one-on-one',
  'order',
  'general',
] as const;

export const contactInterestSchema = z.enum(contactInterestValues);

export type ContactInterest = z.infer<typeof contactInterestSchema>;

/** Older and friendlier ?interest= values on contact links, mapped to the stored keys. */
export const contactInterestAliases: Record<string, ContactInterest> = {
  beginner: 'move',
  advanced: 'strong',
};

/** Shared display labels used by the public form, admin portal, and notifications. */
export const contactInterestLabels = {
  move: programCatalogByKey['move-volume-1'].volumeName,
  intermediate: 'Intermediate · Volume 1',
  strong: programCatalogByKey['strong-volume-1'].volumeName,
  nourish: programCatalogByKey['nourish-volume-1'].volumeName,
  reconnect: programCatalogByKey['reconnect-volume-1'].volumeName,
  'one-on-one': 'One-on-one training',
  order: 'An order, payment or refund',
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

/** Website-to-admin contract for the public contact form. */
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
