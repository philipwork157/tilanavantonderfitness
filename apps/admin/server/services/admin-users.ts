import { and, eq, isNull } from 'drizzle-orm';
import { ADMIN_AREA_ROLES, hasAnyRole, roles, userRoles, users, type Database } from '@tilana/db';
import type { AdminUser } from '@tilana/contracts/admin-auth';
import { confirmedEmail, type AuthUserLike } from '../utils/admin-access';

export interface AuthIdentity extends AuthUserLike {
  id: string;
}

/**
 * Find the users row for a Supabase identity and return it only if it may use
 * the admin website (active, with an admin-area role).
 *
 * Linking: the first sign-in connects the Supabase account to the users row
 * with the same confirmed email, but only while that row is not yet linked to
 * a different account.
 */
export async function resolveAdminUser(
  db: Database,
  identity: AuthIdentity,
  options: { recordSignIn?: boolean } = {},
): Promise<AdminUser | null> {
  let [user] = await db.select().from(users).where(eq(users.authUserId, identity.id));

  if (!user) {
    const email = confirmedEmail(identity);
    if (!email) return null;
    [user] = await db.update(users)
      .set({ authUserId: identity.id })
      .where(and(eq(users.email, email), isNull(users.authUserId)))
      .returning();
  }

  if (!user || !user.isActive) return null;

  const granted = await db.select({ key: roles.key }).from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, user.id));
  const roleKeys = granted.map(row => row.key).sort();

  if (!hasAnyRole(roleKeys, ADMIN_AREA_ROLES)) return null;

  if (options.recordSignIn) {
    await db.update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, user.id));
  }

  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roles: roleKeys,
  };
}
