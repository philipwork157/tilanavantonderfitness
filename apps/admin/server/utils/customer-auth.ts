import { clients, orders, userRoles, users } from '@tilana/db/schema';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { H3Event } from 'h3';
import { createSupabaseAuthClient } from './supabase-auth';
import { getDatabase } from './database';

export async function linkVerifiedCustomerAccount(event: H3Event) {
  const supabase = createSupabaseAuthClient(event);
  const { data: { user }, error } = await supabase.auth.getUser();
  const email = user?.email?.trim().toLowerCase();

  if (error || !user || !email || !user.email_confirmed_at) {
    throw createError({ statusCode: 401, statusMessage: 'A verified customer account is required.' });
  }

  const database = getDatabase();
  return database.transaction(async (transaction) => {
    const [client] = await transaction
      .select({
        id: clients.id,
        userId: clients.userId,
        firstName: clients.firstName,
        lastName: clients.lastName,
      })
      .from(clients)
      .innerJoin(orders, and(eq(orders.clientId, clients.id), eq(orders.status, 'paid')))
      .where(sql`lower(${clients.email}) = ${email}`)
      .limit(1);

    if (!client) {
      throw createError({ statusCode: 403, statusMessage: 'No paid programs are linked to this email address.' });
    }

    let [appUser] = await transaction
      .select({ id: users.id, supabaseId: users.supabaseId })
      .from(users)
      .where(or(eq(users.supabaseId, user.id), sql`lower(${users.email}) = ${email}`))
      .limit(1);

    if (appUser && appUser.supabaseId !== user.id) {
      throw createError({ statusCode: 409, statusMessage: 'This email is already linked to another account.' });
    }

    if (!appUser) {
      [appUser] = await transaction
        .insert(users)
        .values({
          supabaseId: user.id,
          firstName: client.firstName,
          lastName: client.lastName,
          email,
        })
        .returning({ id: users.id, supabaseId: users.supabaseId });
    }

    if (!appUser) throw new Error('The customer user could not be created.');
    if (client.userId && client.userId !== appUser.id) {
      throw createError({ statusCode: 409, statusMessage: 'This purchase is already linked to another account.' });
    }

    await transaction
      .update(clients)
      .set({ userId: appUser.id, updatedAt: new Date() })
      .where(and(eq(clients.id, client.id), or(isNull(clients.userId), eq(clients.userId, appUser.id))));

    await transaction
      .insert(userRoles)
      .values({ userId: appUser.id, role: 'customer' })
      .onConflictDoNothing();

    return { userId: appUser.id, clientId: client.id, email };
  });
}

export async function requireCustomer(event: H3Event) {
  const supabase = createSupabaseAuthClient(event);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw createError({ statusCode: 401, statusMessage: 'Please sign in to view your programs.' });

  const [customer] = await getDatabase()
    .select({ userId: users.id, clientId: clients.id, email: users.email, firstName: users.firstName })
    .from(users)
    .innerJoin(clients, eq(clients.userId, users.id))
    .where(eq(users.supabaseId, user.id))
    .limit(1);

  if (!customer) throw createError({ statusCode: 403, statusMessage: 'No customer purchases are linked to this account.' });
  return customer;
}
