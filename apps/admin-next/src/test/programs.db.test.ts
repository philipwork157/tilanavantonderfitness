/** Database tests for programs. Need TEST_DATABASE_URL (throwaway Postgres). */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, programs, programVolumes, type Database } from '@tilana/db';
import { listPrograms, uniqueProgramSlug } from '@/server/services/programs';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('programs (database)', () => {
  let db: Database;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = createDatabase(url!, { max: 1 }));
    const migrationsFolder = fileURLToPath(new URL('../../../../packages/db/migrations', import.meta.url));
    await migrate(db, { migrationsFolder });
    // Other test files truncate users (and with it programs), so run the idempotent seed again.
    for (const statement of readFileSync(`${migrationsFolder}/0006_seed_programs.sql`, 'utf8').split('--> statement-breakpoint')) {
      await db.execute(sql.raw(statement));
    }
  });

  afterAll(async () => {
    await close?.();
  });

  it('seeds the five current programs as drafts with their public slugs and prices', async () => {
    const rows = await listPrograms(db);
    const seeded = rows.filter(row => ['move', 'intermediate', 'strong', 'reconnect', 'nourish'].includes(row.slug));
    expect(seeded.map(row => row.name)).toEqual(['Beginner', 'Intermediate', 'Advanced', 'Reconnect', 'Nourish']);
    expect(seeded.every(row => row.status === 'draft')).toBe(true);
    expect(seeded.map(row => [row.volumes[0]?.slug, row.volumes[0]?.priceCents, row.volumes[0]?.isAvailable])).toEqual([
      ['move-volume-1', 39_900, false],
      ['intermediate-volume-1', 79_900, false],
      ['strong-volume-1', 79_900, false],
      ['reconnect-volume-1', 39_900, false],
      ['nourish-volume-1', 39_900, false],
    ]);
  });

  it('makes unique program slugs', async () => {
    expect(await uniqueProgramSlug(db, 'Nourish')).toBe('nourish-2');
    expect(await uniqueProgramSlug(db, 'Mobility & Flow')).toBe('mobility-flow');
  });

  it('guards the program rules in the database', async () => {
    await db.execute(sql`delete from programs where slug like 'test-%'`);
    await expect(db.insert(programs).values({ slug: 'test-a', name: 'A', series: 'strength' })).rejects.toThrow();
    await expect(db.insert(programs).values({ slug: 'test-b', name: 'B', series: 'focus', step: 1 })).rejects.toThrow();
    await expect(db.insert(programs).values({ slug: 'Test Bad', name: 'C' })).rejects.toThrow();
    await expect(db.insert(programs).values({ slug: 'test-d', name: 'D', status: 'published' })).rejects.toThrow();

    const [program] = await db.insert(programs).values({ slug: 'test-e', name: 'E' }).returning();
    const volume = { programId: program!.id, slug: 'test-e-volume-1', volumeNumber: 1, name: 'E · Volume 1', priceCents: 39_900 };
    // Nothing can go on sale without a PDF.
    await expect(db.insert(programVolumes).values({ ...volume, isAvailable: true })).rejects.toThrow();
    // File details are all set together or not at all.
    await expect(db.insert(programVolumes).values({ ...volume, filePath: 'volumes/1/v1.pdf' })).rejects.toThrow();
    await expect(db.insert(programVolumes).values({ ...volume, priceCents: 0 })).rejects.toThrow();
    await db.insert(programVolumes).values({
      ...volume,
      isAvailable: true,
      filePath: 'volumes/1/v1-abc.pdf',
      fileName: 'Tilana van Tonder - E Volume 1.pdf',
      fileSizeBytes: 1234,
      fileSha256: 'a'.repeat(64),
      fileVersion: 1,
      fileUploadedAt: new Date(),
    });
    // Volume numbers are unique per program.
    await expect(db.insert(programVolumes).values({ ...volume, slug: 'test-e-volume-1b' })).rejects.toThrow();
    // Deleting a program removes its volumes.
    await db.execute(sql`delete from programs where slug = 'test-e'`);
    expect(await db.select().from(programVolumes).where(sql`slug = 'test-e-volume-1'`)).toEqual([]);
  });
});
