import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createDatabase, type Database } from '@tilana/db/server';
import { clients, orderItems, orders, payments, programAccess, programs, programVolumes } from '@tilana/db/schema';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Never fall back to the app's configured database; require an empty local test database. */
export async function createPaystackTestDatabase(beforeSettlementProtection?: (database: Database) => Promise<void>) {
  const rawUrl = process.env.PAYSTACK_TEST_DATABASE_URL;
  if (!rawUrl) throw new Error('Set PAYSTACK_TEST_DATABASE_URL to an empty, disposable local PostgreSQL database.');
  const url = new URL(rawUrl);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || !/^\/tilana_paystack_test_[a-z0-9_]+$/.test(url.pathname)
    || url.search || url.hash
  ) {
    throw new Error('Integration tests require a loopback database named tilana_paystack_test_<unique suffix>, without URL options.');
  }

  const database = createDatabase(rawUrl);
  try {
    const existing = await database.$client`
      select 1 from pg_tables
      where schemaname not in ('pg_catalog', 'information_schema') limit 1
    `;
    if (existing.length) throw new Error('Refusing to migrate a nonempty integration database. Create a fresh test database.');
    // Supabase owns this table in production. Only the UUID bridge is needed
    // to apply the repository's actual migrations in an isolated test cluster.
    await database.$client`create schema auth`;
    await database.$client`create table auth.users (id uuid primary key)`;
    const migrationsFolder = fileURLToPath(new URL('../../../../supabase/migrations', import.meta.url));
    if (beforeSettlementProtection) {
      // Legacy repair fixtures must exist before the new guards, never disable
      // constraints in a database purporting to test the current application.
      const temporary = await mkdtemp(join(tmpdir(), 'tilana-migration-fixture-'));
      try {
        await cp(migrationsFolder, temporary, { recursive: true });
        const journalPath = join(temporary, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 28);
        await writeFile(journalPath, JSON.stringify(journal));
        await migrate(database, { migrationsFolder: temporary });
        await beforeSettlementProtection(database);
      } finally { await rm(temporary, { recursive: true, force: true }); }
    }
    await migrate(database, { migrationsFolder });
    return database;
  } catch (error) {
    await database.$client.end();
    throw error;
  }
}

/** Seed a separate pending purchase for every scenario, preserving real foreign keys. */
export async function seedPendingPayment(database: Database) {
  const suffix = randomUUID();
  const reference = `TVT-${suffix}`;
  const [client] = await database.insert(clients).values({
    firstName: 'Test', lastName: 'Customer', email: `${suffix}@example.test`,
  }).returning();
  const [program] = await database.insert(programs).values({ slug: `program-${suffix}`, name: 'Test program' }).returning();
  const [volume] = await database.insert(programVolumes).values({
    programId: program!.id, volumeNumber: 1, name: 'Test volume', currentPriceCents: 10000,
  }).returning();
  const [order] = await database.insert(orders).values({
    orderNumber: `TEST-${suffix}`, clientId: client!.id, status: 'pending', subtotalCents: 10000, totalCents: 10000,
  }).returning();
  const [item] = await database.insert(orderItems).values({
    orderId: order!.id, clientId: client!.id, programVolumeId: volume!.id,
    description: 'Test volume', unitPriceCents: 10000, lineTotalCents: 10000,
  }).returning();
  const [payment] = await database.insert(payments).values({
    orderId: order!.id, provider: 'paystack', providerReference: reference,
    amountCents: 10000, currency: 'ZAR', environment: 'test',
  }).returning();
  if (!payment || !order || !item) throw new Error('Test purchase could not be seeded.');
  return { reference, paymentId: payment.id, orderId: order.id, itemId: item.id };
}

export type PaymentFixture = Awaited<ReturnType<typeof seedPendingPayment>>;

/** Snapshot all financially relevant records to detect otherwise silent race damage. */
export async function readPaymentState(database: Database, fixture: PaymentFixture) {
  const [payment] = await database.select().from(payments).where(eq(payments.id, fixture.paymentId));
  const [order] = await database.select().from(orders).where(eq(orders.id, fixture.orderId));
  const access = await database.select().from(programAccess).where(eq(programAccess.orderItemId, fixture.itemId));
  return { payment, order, access };
}

/** Explicit barriers make interleavings reproducible without timing-dependent sleeps. */
export function createBarrier<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}
