/**
 * Plain validation messages + field type — no zod import, so this can be pulled
 * into the browser bundle without shipping the whole schema library. The server
 * still validates with the full zod schema in ./newsletter.
 */
export const newsletterValidationMessages = {
  email: 'Please enter a valid email address.',
  consent: 'Please agree to receive the newsletter.',
  turnstileToken: 'Please complete the security check.',
} as const;

export type NewsletterFormField = keyof typeof newsletterValidationMessages;
