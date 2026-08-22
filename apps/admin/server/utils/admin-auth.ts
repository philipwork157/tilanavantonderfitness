import type { AdminSessionResponse } from '@tilana/contracts/auth';
import { profiles, userRoles } from '@tilana/db/schema';
import { and, eq } from 'drizzle-orm';
import type { H3Event } from 'h3';
import { createSupabaseAuthClient } from './supabase-auth';
import { getDatabase } from './database';

export async function getAdminSession(event: H3Event): Promise<AdminSessionResponse | null> {
  const supabase = createSupabaseAuthClient(event);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) return null;

  const admin = await findAdminProfile(user.id);

  if (!admin) return null;

  return {
    authenticated: true,
    user: {
      id: admin.userId,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: 'admin',
    },
  };
}

export async function findAdminProfile(userId: string) {
  const [admin] = await getDatabase()
    .select({
      userId: profiles.userId,
      firstName: profiles.firstName,
      lastName: profiles.lastName,
      email: profiles.email,
    })
    .from(profiles)
    .innerJoin(
      userRoles,
      and(eq(userRoles.userId, profiles.userId), eq(userRoles.role, 'admin')),
    )
    .where(eq(profiles.userId, userId))
    .limit(1);

  return admin ?? null;
}

export async function requireAdmin(event: H3Event): Promise<AdminSessionResponse> {
  const session = await getAdminSession(event);

  if (!session) {
    throw createError({
      statusCode: 401,
      statusMessage: 'You must sign in as an administrator.',
    });
  }

  return session;
}
