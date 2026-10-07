import 'server-only';
import type { AdminUser } from '@tilana/contracts/admin-auth';
import { hasAnyRole, type RoleKey } from '@tilana/db';
import { resolveAdminUser } from './admin-users';
import { getDatabase } from '../db';
import { HttpError } from '../http';
import { createSupabaseServerClient } from './supabase';

/**
 * The signed-in admin, or null. getUser() asks Supabase to verify the token
 * rather than trusting the cookie; the database then decides access.
 */
export async function getAdmin(): Promise<AdminUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return resolveAdminUser(getDatabase(), data.user);
}

/** Use in every admin API route. */
export async function requireAdmin(): Promise<AdminUser> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new HttpError(401, 'Please sign in.');
  const admin = await resolveAdminUser(getDatabase(), data.user);
  if (!admin) throw new HttpError(403, 'This account does not have admin access.');
  return admin;
}

/** For routes limited to specific roles, e.g. requireRole(['admin']) for money. */
export async function requireRole(allowed: readonly RoleKey[]): Promise<AdminUser> {
  const admin = await requireAdmin();
  if (!hasAnyRole(admin.roles, allowed)) throw new HttpError(403, 'You do not have permission to do this.');
  return admin;
}
