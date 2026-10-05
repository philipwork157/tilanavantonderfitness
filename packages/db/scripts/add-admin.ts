/**
 * Create (or update) a user and grant them a role. Safe to run more than once.
 *
 *   pnpm --filter @tilana/db db:add-admin --email tilana@example.com --first-name Tilana --last-name "van Tonder"
 *   pnpm --filter @tilana/db db:add-admin --email someone@example.com --role staff
 *
 * The person signs in with their existing Supabase account; the first sign-in
 * links that account to this user by confirmed email address.
 */
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { and, eq, sql } from 'drizzle-orm';
import { createDatabase } from '../src/client';
import { ROLE_KEYS, type RoleKey } from '../src/roles';
import { roles, userRoles, users } from '../src/schema';

const envFile = '../../apps/admin/.env';
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { values } = parseArgs({
  options: {
    'email': { type: 'string' },
    'first-name': { type: 'string' },
    'last-name': { type: 'string' },
    'role': { type: 'string', default: 'admin' },
  },
});

const email = values.email?.trim().toLowerCase();
const role = values.role as RoleKey;

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Pass a valid --email.');
  process.exit(1);
}
if (!ROLE_KEYS.includes(role)) {
  console.error(`--role must be one of: ${ROLE_KEYS.join(', ')}`);
  process.exit(1);
}
if (!process.env.NUXT_DATABASE_URL) {
  console.error('NUXT_DATABASE_URL is not set (apps/admin/.env).');
  process.exit(1);
}

const { db, close } = createDatabase(process.env.NUXT_DATABASE_URL, { max: 1 });

try {
  const result = await db.transaction(async (tx) => {
    const [user] = await tx.insert(users)
      .values({ email, firstName: values['first-name'] ?? null, lastName: values['last-name'] ?? null })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          firstName: sql`coalesce(excluded.first_name, ${users.firstName})`,
          lastName: sql`coalesce(excluded.last_name, ${users.lastName})`,
          isActive: true,
          updatedAt: new Date(),
        },
      })
      .returning({ id: users.id, email: users.email });

    const [roleRow] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.key, role));
    if (!roleRow) throw new Error(`Role "${role}" is missing. Run the migrations first.`);

    await tx.insert(userRoles).values({ userId: user!.id, roleId: roleRow.id }).onConflictDoNothing();

    const granted = await tx.select({ key: roles.key }).from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(userRoles.userId, user!.id)));
    return { ...user!, roles: granted.map(r => r.key) };
  });

  console.log(`User #${result.id} ${result.email} now has roles: ${result.roles.join(', ')}`);
}
finally {
  await close();
}
