import type { AdminSessionResponse } from '@tilana/contracts/auth';
import { userRoles, users } from '@tilana/db/schema';
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

  const admin = await findAdminUser(user.id);

  if (!admin) return null;

  return {
    authenticated: true,
    user: {
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: 'admin',
    },
  };
}

export async function findAdminUser(supabaseId: string) {
  const [admin] = await getDatabase()
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(users)
    .innerJoin(
      userRoles,
      and(eq(userRoles.userId, users.id), eq(userRoles.role, 'admin')),
    )
    .where(eq(users.supabaseId, supabaseId))
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
