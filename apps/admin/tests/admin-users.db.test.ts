/**
 * Database tests for admin access. They need an isolated, throwaway Postgres:
 *   TEST_DATABASE_URL=postgresql://... pnpm --filter @tilana/admin test
 * Without TEST_DATABASE_URL they are skipped. Never point this at a real database.
 */
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, roles, userRoles, users, type Database } from '@tilana/db';
import { resolveAdminUser } from '../server/services/admin-users';

const url = process.env.TEST_DATABASE_URL;
const confirmed = '2026-01-01T00:00:00Z';
const authId = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

describe.skipIf(!url)('resolveAdminUser (database)', () => {
  let db: Database;
  let close: () => Promise<void>;

  async function addUser(email: string, roleKeys: string[], extra: Partial<typeof users.$inferInsert> = {}) {
    const [user] = await db.insert(users).values({ email, ...extra }).returning();
    for (const key of roleKeys) {
      const [role] = await db.select().from(roles).where(eq(roles.key, key));
      await db.insert(userRoles).values({ userId: user!.id, roleId: role!.id });
    }
    return user!;
  }

  beforeAll(async () => {
    ({ db, close } = createDatabase(url!, { max: 1 }));
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../../packages/db/migrations', import.meta.url)) });
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table user_roles, users restart identity cascade`);
  });

  afterAll(async () => {
    await close?.();
  });

  it('seeds the three roles', async () => {
    const keys = (await db.select().from(roles)).map(r => r.key).sort();
    expect(keys).toEqual(['admin', 'customer', 'staff']);
  });

  it('links the Supabase account on first sign-in by confirmed email and returns roles', async () => {
    await addUser('tilana@example.com', ['admin', 'customer'], { firstName: 'Tilana' });
    const admin = await resolveAdminUser(db, { id: authId(1), email: 'Tilana@Example.com', email_confirmed_at: confirmed }, { recordSignIn: true });

    expect(admin).toMatchObject({ id: 1, email: 'tilana@example.com', firstName: 'Tilana', roles: ['admin', 'customer'] });
    const [row] = await db.select().from(users).where(eq(users.id, 1));
    expect(row!.authUserId).toBe(authId(1));
    expect(row!.lastSignInAt).toBeInstanceOf(Date);
  });

  it('finds an already linked user by Supabase id even if the email changed', async () => {
    await addUser('tilana@example.com', ['admin'], { authUserId: authId(1) });
    const admin = await resolveAdminUser(db, { id: authId(1), email: 'new@example.com', email_confirmed_at: confirmed });
    expect(admin?.id).toBe(1);
  });

  it('refuses an unconfirmed email', async () => {
    await addUser('tilana@example.com', ['admin']);
    expect(await resolveAdminUser(db, { id: authId(1), email: 'tilana@example.com', email_confirmed_at: null })).toBeNull();
  });

  it('refuses a second Supabase account claiming an already linked email', async () => {
    await addUser('tilana@example.com', ['admin'], { authUserId: authId(1) });
    expect(await resolveAdminUser(db, { id: authId(2), email: 'tilana@example.com', email_confirmed_at: confirmed })).toBeNull();
  });

  it('refuses unknown, inactive and customer-only users', async () => {
    await addUser('off@example.com', ['admin'], { isActive: false });
    await addUser('buyer@example.com', ['customer']);

    expect(await resolveAdminUser(db, { id: authId(3), email: 'nobody@example.com', email_confirmed_at: confirmed })).toBeNull();
    expect(await resolveAdminUser(db, { id: authId(4), email: 'off@example.com', email_confirmed_at: confirmed })).toBeNull();
    expect(await resolveAdminUser(db, { id: authId(5), email: 'buyer@example.com', email_confirmed_at: confirmed })).toBeNull();
  });

  it('allows staff into the admin area', async () => {
    await addUser('staff@example.com', ['staff']);
    const staff = await resolveAdminUser(db, { id: authId(6), email: 'staff@example.com', email_confirmed_at: confirmed });
    expect(staff?.roles).toEqual(['staff']);
  });

  it('stores emails lowercase only', async () => {
    await expect(db.insert(users).values({ email: 'Mixed@Example.com' })).rejects.toThrow();
  });
});
