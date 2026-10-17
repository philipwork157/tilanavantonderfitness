import { z } from 'zod';

/** Customer asks for a sign-in link to reach purchased programs. */
export const customerMagicLinkRequestSchema = z.object({
  email: z.string().trim().email().max(254),
});

/** Always `ok`, so the response never reveals whether an account exists. */
export const customerMagicLinkResponseSchema = z.object({ ok: z.literal(true) });

export type CustomerMagicLinkRequest = z.infer<typeof customerMagicLinkRequestSchema>;
export type CustomerMagicLinkResponse = z.infer<typeof customerMagicLinkResponseSchema>;
