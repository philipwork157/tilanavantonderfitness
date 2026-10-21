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

/**
 * "An order, payment or refund": what went wrong. The website shows a short
 * tip for each one, and the admin matches the enquiry to the order.
 */
export const orderHelpTopicValues = [
  'not-received',
  'wrong-email',
  'payment-failed',
  'charged-problem',
  'file-problem',
  'refund',
  'other',
] as const;

export const orderHelpTopicSchema = z.enum(orderHelpTopicValues);
export type OrderHelpTopic = z.infer<typeof orderHelpTopicSchema>;

export const orderHelpTopicLabels = {
  'not-received': "My programs didn't arrive",
  'wrong-email': 'I bought with the wrong email address',
  'payment-failed': "My payment didn't go through",
  'charged-problem': "I was charged, but something's not right",
  'file-problem': "A PDF won't open or looks wrong",
  refund: "I'd like a refund",
  other: 'Something else',
} as const satisfies Record<OrderHelpTopic, string>;

export const orderHelpTopicOptions = orderHelpTopicValues.map((value) => ({
  value,
  label: orderHelpTopicLabels[value],
}));

/** Topics the visitor must explain in the message; the rest can be sent as they are. */
export const orderHelpTopicsNeedingMessage: readonly OrderHelpTopic[] = ['wrong-email', 'file-problem', 'other'];

/** Order numbers look like TV-7K4Q9P. */
export const orderNumberPattern = /^TV-[A-Z0-9]{6}$/;

/** "tv 7k4q9p", "TV7K4Q9P" and "#TV-7K4Q9P" all become "TV-7K4Q9P". Anything else is returned trimmed. */
export function normalizeOrderNumber(value: string): string {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const match = /^TV([A-Z0-9]{6})$/.exec(compact);
  return match ? `TV-${match[1]}` : value.trim();
}

export const contactInterestOptions = contactInterestValues.map((value) => ({
  value,
  label: contactInterestLabels[value],
}));

export type ContactFormField =
  | 'name'
  | 'email'
  | 'interest'
  | 'message'
  | 'orderTopic'
  | 'orderNumber'
  | 'purchaseEmail'
  | 'consent'
  | 'turnstileToken';

/** Human-friendly validation copy shared by browser and API responses. */
export const contactValidationMessages = {
  name: 'Please enter your full name (at least 2 characters).',
  email: 'Please enter a valid email address.',
  interest: 'Please choose what you are interested in.',
  message: 'Please tell Tilana a little more (at least 10 characters).',
  orderTopic: 'Please choose what you need help with.',
  orderNumber: 'Order numbers look like TV-7K4Q9P. Leave it empty if you do not have it.',
  purchaseEmail: 'Please enter the email address you used to buy, or leave it empty.',
  consent: 'Please accept the privacy agreement before sending.',
  turnstileToken: 'Please complete the security check.',
} as const satisfies Record<ContactFormField, string>;

/** Website-to-admin contract for the public contact form. */
export const contactFormRequestSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  interest: contactInterestSchema,
  message: z.string().trim().max(3000).default(''),
  // Only for interest "order"; ignored otherwise.
  orderTopic: orderHelpTopicSchema.nullish(),
  orderNumber: z.string().max(40).nullish()
    .transform((value) => (value ? normalizeOrderNumber(value) : '') || null)
    .refine((value) => value === null || orderNumberPattern.test(value)),
  purchaseEmail: z.string().trim().max(254).nullish()
    .transform((value) => value?.toLowerCase() || null)
    .refine((value) => value === null || z.string().email().safeParse(value).success),
  consent: z.literal(true),
  website: z.string().max(200).default(''),
  turnstileToken: z.string().max(2048).default(''),
}).superRefine((value, ctx) => {
  const isOrder = value.interest === 'order';
  if (isOrder && !value.orderTopic) {
    ctx.addIssue({ code: 'custom', path: ['orderTopic'], message: contactValidationMessages.orderTopic });
  }
  const needsMessage = !isOrder || !value.orderTopic || orderHelpTopicsNeedingMessage.includes(value.orderTopic);
  if (needsMessage && value.message.length < 10) {
    ctx.addIssue({ code: 'custom', path: ['message'], message: contactValidationMessages.message });
  }
}).transform((value) => (value.interest === 'order'
  ? value
  : { ...value, orderTopic: null, orderNumber: null, purchaseEmail: null }));

export const contactFormResponseSchema = z.object({
  ok: z.literal(true),
});

export type ContactFormRequest = z.infer<typeof contactFormRequestSchema>;
export type ContactFormResponse = z.infer<typeof contactFormResponseSchema>;
