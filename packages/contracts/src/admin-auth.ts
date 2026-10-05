import { z } from 'zod';

/** Admin password sign-in. Messages stay generic so they never hint at which field was wrong. */
export const adminLoginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
});

export const adminUserSchema = z.object({
  id: z.number().int().positive(),
  email: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  roles: z.array(z.string()),
});

export const adminSessionResponseSchema = z.object({
  user: adminUserSchema,
});

export type AdminLoginRequest = z.infer<typeof adminLoginRequestSchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminSessionResponse = z.infer<typeof adminSessionResponseSchema>;
