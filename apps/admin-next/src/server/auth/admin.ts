import 'server-only';
import type { AdminUser } from '@tilana/contracts/admin-auth';
import { hasAnyRole, type RoleKey } from '@tilana/db';
import { cache } from 'react';
import { findLinkedAdmin, resolveAdminUser } from './admin-users';
import { getDatabase } from '../db';
import { HttpError } from '../http';
import { setRequestUser } from '../logger';
import { createSupabaseServerClient } from './supabase';

type AdminCheck = { admin: AdminUser } | { admin: null; reason: 'signed-out' | 'no-access' };

/**
 * Who is signed in, and may they use the admin? Speed matters here: it runs
 * on every page and API call, and Supabase is far away (Frankfurt).
 *
 * - getClaims() checks the session token's signature on this server with
 *   Supabase's public signing keys (fetched once, then cached), so it costs
 *   no network call. With a project still on the old shared JWT secret it
 *   asks Supabase instead, which is safe but slower.
 * - The database then decides access in one query (active, admin-area role),
 *   so removing someone's role takes effect on their next click.
 * - cache(): the layout and the page share one check per page view.
 */
const checkAdmin = cache(async (): Promise<AdminCheck> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const authUserId = data?.claims?.sub;
  if (error || !authUserId) return { admin: null, reason: 'signed-out' };

  const db = getDatabase();
  let admin = await findLinkedAdmin(db, authUserId);
  if (admin === undefined) {
    // Not linked yet (normally done at sign-in): link by confirmed email,
    // which needs the full user record from Supabase.
    const { data: full } = await supabase.auth.getUser();
    admin = full.user ? await resolveAdminUser(db, full.user) : null;
  }
  if (!admin) return { admin: null, reason: 'no-access' };
  setRequestUser(admin);
  return { admin };
});

/** The signed-in admin, or null. */
export async function getAdmin(): Promise<AdminUser | null> {
  return (await checkAdmin()).admin;
}

/** Use in every admin API route. */
export async function requireAdmin(): Promise<AdminUser> {
  const result = await checkAdmin();
  if (result.admin) return result.admin;
  if (result.reason === 'signed-out') throw new HttpError(401, 'Please sign in.');
  throw new HttpError(403, 'This account does not have admin access.');
}

/** For routes limited to specific roles, e.g. requireRole(['admin']) for money. */
export async function requireRole(allowed: readonly RoleKey[]): Promise<AdminUser> {
  const admin = await requireAdmin();
  if (!hasAnyRole(admin.roles, allowed)) throw new HttpError(403, 'You do not have permission to do this.');
  return admin;
}
