import 'server-only';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import { ADMIN_AREA_ROLES, hasAnyRole, roles, userRoles, users, type Database } from '@tilana/db';
import type { AdminUser } from '@tilana/contracts/admin-auth';
import { confirmedEmail, type AuthUserLike } from './admin-access';

export interface AuthIdentity extends AuthUserLike {
  id: string;
}

/** One users row with its role keys, read in a single query. */
async function userWithRoles(db: Database, where: SQL) {
  const rows = await db.select({ user: users, role: roles.key }).from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .where(where);
  if (!rows.length) return null;
  const roleKeys = rows.flatMap(row => (row.role ? [row.role] : [])).sort();
  return { user: rows[0].user, roleKeys };
}

function toAdmin(found: NonNullable<Awaited<ReturnType<typeof userWithRoles>>>): AdminUser | null {
  const { user, roleKeys } = found;
  if (!user.isActive || !hasAnyRole(roleKeys, ADMIN_AREA_ROLES)) return null;
  return { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, roles: roleKeys };
}

/**
 * The admin already linked to this Supabase account (one query). Returns
 * undefined when no users row is linked yet, so the caller can fall back to
 * resolveAdminUser, which links by confirmed email.
 */
export async function findLinkedAdmin(db: Database, authUserId: string): Promise<AdminUser | null | undefined> {
  const found = await userWithRoles(db, eq(users.authUserId, authUserId));
  return found ? toAdmin(found) : undefined;
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
  let found = await userWithRoles(db, eq(users.authUserId, identity.id));

  if (!found) {
    const email = confirmedEmail(identity);
    if (!email) return null;
    const [linked] = await db.update(users)
      .set({ authUserId: identity.id })
      .where(and(eq(users.email, email), isNull(users.authUserId)))
      .returning({ id: users.id });
    if (!linked) return null;
    found = await userWithRoles(db, eq(users.id, linked.id));
    if (!found) return null;
  }

  const admin = toAdmin(found);
  if (admin && options.recordSignIn) {
    await db.update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, admin.id));
  }
  return admin;
}
