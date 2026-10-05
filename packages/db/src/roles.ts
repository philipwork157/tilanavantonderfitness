/**
 * Role keys stored in the `roles` table (seeded by migration). A user can hold
 * several roles. What each role may do is decided in application code.
 */
export const ROLE_KEYS = ['admin', 'staff', 'customer'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

/** Roles that may sign in to the admin website. */
export const ADMIN_AREA_ROLES = ['admin', 'staff'] as const satisfies readonly RoleKey[];

export function hasAnyRole(userRoles: readonly string[], allowed: readonly RoleKey[]): boolean {
  return userRoles.some(role => (allowed as readonly string[]).includes(role));
}
