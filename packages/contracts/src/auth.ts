import { z } from 'zod';

export const adminLoginRequestSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
});

export const adminSessionResponseSchema = z.object({
  authenticated: z.literal(true),
  user: z.object({
    id: z.number().int().positive(),
    email: z.string().email(),
    firstName: z.string(),
    lastName: z.string(),
    role: z.literal('admin'),
  }),
});

export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>;
export type AdminSessionResponse = z.infer<typeof adminSessionResponseSchema>;
