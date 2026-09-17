import { z } from 'zod';

export const USER_ROLES = {
  ADMIN: 'admin',
  CUSTOMER: 'customer',
  STAFF: 'staff',
} as const;

export const userRoleValues = [
  USER_ROLES.ADMIN,
  USER_ROLES.CUSTOMER,
  USER_ROLES.STAFF,
] as const;

export const userRoleSchema = z.enum(userRoleValues);
export type UserRole = z.infer<typeof userRoleSchema>;
