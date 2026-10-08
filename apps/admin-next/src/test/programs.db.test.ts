/** Database tests for volumes and programs. Need TEST_DATABASE_URL (throwaway Postgres). */
import { fileURLToPath } from 'node:url';
import { eq, inArray, like } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDatabase, programs, volumes, type Database, type Volume } from '@tilana/db';
import { publicCatalogueVolumeResponseSchema } from '@tilana/contracts/catalogue';
import { publicProgramsResponseSchema } from '@tilana/contracts/public-programs';
import { GET as getPublicPrograms } from '@/app/api/public/programs/route';
import { GET as getPublicVolume } from '@/app/api/public/program-volumes/[slug]/route';
import {
  findProgramBySlug, listVolumePrograms, listVolumes, listWebsitePrograms, nextVolumeNumber, toPublicProgram, uniqueProgramSlug,
} from '@/server/services/programs';

const url = process.env.TEST_DATABASE_URL;
const pdf = { filePath: 'programs/x/v1-abc.pdf', fileName: 'x.pdf', fileSizeBytes: 10, fileSha256: 'b'.repeat(64), fileVersion: 1, fileUploadedAt: new Date() };

describe.skipIf(!url)('volumes and programs (database)', () => {
  let db: Database;
  let close: () => Promise<void>;
  let live: Volume;
  let hidden: Volume;

  beforeAll(async () => {
    ({ db, close } = createDatabase(url!, { max: 1 }));
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../../../packages/db/migrations', import.meta.url)) });
    // Test volumes far from the real ones; other test files may have emptied the tables.
    await db.delete(programs).where(like(programs.slug, 'test-%'));
    await db.delete(volumes).where(inArray(volumes.number, [90, 91]));
    [live] = await db.insert(volumes).values({ number: 90, name: 'Volume 90', isActive: true }).returning() as [Volume];
    [hidden] = await db.insert(volumes).values({ number: 91, name: 'Volume 91', isActive: false }).returning() as [Volume];
  });

  afterAll(async () => {
    await db.delete(programs).where(like(programs.slug, 'test-%'));
    await db.delete(volumes).where(inArray(volumes.number, [90, 91]));
    await close?.();
  });

  it('numbers new volumes after the highest one', async () => {
    expect(await nextVolumeNumber(db)).toBeGreaterThanOrEqual(92);
    await expect(db.insert(volumes).values({ number: 90, name: 'Again' })).rejects.toThrow();
    await expect(db.insert(volumes).values({ number: 100, name: 'Too high' })).rejects.toThrow();
  });

  it('makes unique program slugs that include the volume', async () => {
    await db.insert(programs).values({ volumeId: live.id, slug: 'test-nourish-volume-90', name: 'Test Nourish', priceCents: 39_900 });
    expect(await uniqueProgramSlug(db, 'Test Nourish', 90)).toBe('test-nourish-volume-90-2');
    expect(await uniqueProgramSlug(db, 'Test Mobility & Flow', 91)).toBe('test-mobility-flow-volume-91');
  });

  it('guards the program rules in the database', async () => {
    const base = { volumeId: live.id, name: 'Rule', priceCents: 39_900 };
    await expect(db.insert(programs).values({ ...base, slug: 'test-a', series: 'strength' })).rejects.toThrow();
    await expect(db.insert(programs).values({ ...base, slug: 'test-b', series: 'focus', step: 1 })).rejects.toThrow();
    await expect(db.insert(programs).values({ ...base, slug: 'Test Bad' })).rejects.toThrow();
    await expect(db.insert(programs).values({ ...base, slug: 'test-c', priceCents: 0 })).rejects.toThrow();
    // File details are all set together or not at all.
    await expect(db.insert(programs).values({ ...base, slug: 'test-d', filePath: 'programs/1/v1.pdf' })).rejects.toThrow();
    // A volume with programs cannot be deleted.
    await expect(db.delete(volumes).where(eq(volumes.id, live.id))).rejects.toThrow();
  });

  it('counts each volume’s programs and the ones with a PDF', async () => {
    await db.insert(programs).values({ volumeId: live.id, slug: 'test-ready-volume-90', name: 'Ready', priceCents: 39_900, ...pdf });
    const row = (await listVolumes(db)).find(volume => volume.id === live.id)!;
    expect(row.programCount).toBe(row.readyCount + 1);
    expect((await listVolumePrograms(db, live)).every(program => program.volumeId === live.id)).toBe(true);
  });

  it('shows the website only programs with a PDF in a volume that is on', async () => {
    await db.insert(programs).values([
      { volumeId: live.id, slug: 'test-web-live', name: 'Live', priceCents: 39_900, sortOrder: 1, ...pdf },
      { volumeId: live.id, slug: 'test-web-no-pdf', name: 'No PDF', priceCents: 39_900, sortOrder: 2 },
      { volumeId: hidden.id, slug: 'test-web-hidden', name: 'Hidden', priceCents: 49_900, ...pdf },
    ]);

    const website = (await listWebsitePrograms(db)).filter(program => program.slug.startsWith('test-web-'));
    expect(website.map(program => program.slug)).toEqual(['test-web-live']);
    const body = publicProgramsResponseSchema.parse({ programs: website.map(toPublicProgram) });
    expect(body.programs[0]).toMatchObject({ slug: 'test-web-live', volumeNumber: 90, priceCents: 39_900 });
    expect(JSON.stringify(body)).not.toContain('programs/x');

    expect((await findProgramBySlug(db, 'test-web-hidden'))?.volume.isActive).toBe(false);
    expect(await findProgramBySlug(db, 'nope-volume-1')).toBeUndefined();

    // The public routes, as the website calls them.
    vi.stubEnv('DATABASE_URL', url!);
    vi.stubEnv('WEBSITE_ORIGINS', 'http://localhost:4321');
    const fromWebsite = new Request('http://admin.test/api/public', { headers: { origin: 'http://localhost:4321' } });
    const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

    const listed = await getPublicPrograms(fromWebsite);
    expect(listed.headers.get('access-control-allow-origin')).toBe('http://localhost:4321');
    expect(publicProgramsResponseSchema.parse(await listed.json()).programs.map(program => program.slug)).toContain('test-web-live');

    const forSale = publicCatalogueVolumeResponseSchema.parse(await (await getPublicVolume(fromWebsite, params('test-web-live'))).json());
    expect(forSale.volume).toMatchObject({ slug: 'test-web-live', name: 'Live · Volume 90', priceCents: 39_900, isAvailable: true });
    for (const slug of ['test-web-no-pdf', 'test-web-hidden']) {
      const notSold = publicCatalogueVolumeResponseSchema.parse(await (await getPublicVolume(fromWebsite, params(slug))).json());
      expect(notSold.volume.isAvailable).toBe(false);
    }
    const missing = await getPublicVolume(fromWebsite, params('nope-volume-1'));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ statusCode: 404, statusMessage: 'Program volume not found.' });
    const elsewhere = await getPublicPrograms(new Request('http://admin.test/api/public', { headers: { origin: 'https://evil.example' } }));
    expect(elsewhere.headers.get('access-control-allow-origin')).toBeNull();
    vi.unstubAllEnvs();
  });
});
