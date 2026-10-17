/**
 * Launch day, once: copy the website content from the development admin to
 * the live admin, so everything Tilana prepared on website-dev goes live as is.
 *
 *   pnpm content:copy                    dry run: lists what would change, changes nothing
 *   pnpm content:copy --apply            copies it
 *   pnpm content:copy --apply --prune    also removes live content that is not on dev
 *                                        (e.g. sample recipes deleted on dev)
 *
 * What is copied (dev wins; matched by volume number and by slug):
 *   volumes, programs (with their PDFs and "Peek inside" pictures), blog posts
 *   (with cover photos), Kitchen recipes (with photos).
 * What is never touched: orders, customers, contact messages, newsletter
 * subscribers and campaigns, admin users, and the old tables from the
 * previous website.
 *
 * Files are copied bucket to bucket (dev-public → prod-public, dev-private →
 * prod-private) under the live row's id, e.g. blog/12/<uuid>.webp; nothing is
 * ever deleted from a bucket. The database changes are one transaction, made
 * only after every file is in place, so a failed run changes no rows.
 *
 * Safety: it refuses to run when the live database already has orders (after
 * launch, edit content in the live admin instead), when both env files point
 * at the same database or buckets, or when the live database is missing
 * columns (run the migrations first).
 *
 * Reads apps/admin-next/.env.local (dev, the source) and
 * apps/admin-next/.env.prod (live, the target). Nothing is printed from them
 * except bucket names.
 */
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs, parseEnv } from 'node:util';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { count, eq, inArray, sql } from 'drizzle-orm';
import { createDatabase, type Database } from '../src/client';
import { blogPosts, orders, programs, recipes, users, volumes, type ProgramPreviewData } from '../src/schema';

const { values: flags } = parseArgs({ options: { apply: { type: 'boolean', default: false }, prune: { type: 'boolean', default: false } } });
const apply = flags.apply;
const prune = flags.prune;

// ── Settings ──
type Env = Record<string, string | undefined>;
function readEnv(file: string, label: string): Env {
  const path = `../../apps/admin-next/${file}`;
  if (!existsSync(path)) fail(`apps/admin-next/${file} (${label}) was not found.`);
  return parseEnv(readFileSync(path, 'utf8'));
}
function fail(message: string, after = 'Nothing was changed.'): never {
  console.error(`\n${message}\n${after}`);
  process.exit(1);
}

const devEnv = readEnv('.env.local', 'development');
const prodEnv = readEnv('.env.prod', 'live');
const required = [
  'DATABASE_URL', 'R2_ACCOUNT_ID', 'R2_PUBLIC_BUCKET', 'R2_PUBLIC_ACCESS_KEY_ID', 'R2_PUBLIC_SECRET_ACCESS_KEY', 'R2_PRIVATE_PROGRAM_BUCKET',
];
const devMissing = [...required, 'R2_DOWNLOAD_ACCESS_KEY_ID', 'R2_DOWNLOAD_SECRET_ACCESS_KEY'].filter(name => !devEnv[name]);
const prodMissing = [...required, 'R2_UPLOAD_ACCESS_KEY_ID', 'R2_UPLOAD_SECRET_ACCESS_KEY'].filter(name => !prodEnv[name]);
if (devMissing.length) fail(`Fill these in apps/admin-next/.env.local first: ${devMissing.join(', ')}`);
if (prodMissing.length) fail(`Fill these in apps/admin-next/.env.prod first: ${prodMissing.join(', ')}`);

/** The database a connection string points at (host, port, user and name; never the password). */
function databaseId(url: string): string {
  const parsed = new URL(url);
  return `${parsed.username}@${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
}
if (databaseId(devEnv.DATABASE_URL!) === databaseId(prodEnv.DATABASE_URL!)) {
  fail('.env.local and .env.prod point at the same database. The live DATABASE_URL must be the live one.');
}
for (const name of ['R2_PUBLIC_BUCKET', 'R2_PRIVATE_PROGRAM_BUCKET']) {
  if (devEnv[name] === prodEnv[name]) fail(`${name} is the same bucket in .env.local and .env.prod.`);
}
const LIVE_SITE = /^https:\/\/(www\.)?tilanavantonder\.co\.za\/?$/;
if (LIVE_SITE.test(devEnv.WEBSITE_URL ?? '')) fail('.env.local points at the live website. The source must be the development admin.');

// ── Buckets ──
const CACHE_FOREVER = 'public, max-age=31536000, immutable';
function r2(env: Env, keyId: string, secret: string) {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env[keyId]!, secretAccessKey: env[secret]! },
  });
}
const stores = {
  public: {
    from: { client: r2(devEnv, 'R2_PUBLIC_ACCESS_KEY_ID', 'R2_PUBLIC_SECRET_ACCESS_KEY'), bucket: devEnv.R2_PUBLIC_BUCKET! },
    to: { client: r2(prodEnv, 'R2_PUBLIC_ACCESS_KEY_ID', 'R2_PUBLIC_SECRET_ACCESS_KEY'), bucket: prodEnv.R2_PUBLIC_BUCKET! },
  },
  private: {
    from: { client: r2(devEnv, 'R2_DOWNLOAD_ACCESS_KEY_ID', 'R2_DOWNLOAD_SECRET_ACCESS_KEY'), bucket: devEnv.R2_PRIVATE_PROGRAM_BUCKET! },
    to: { client: r2(prodEnv, 'R2_UPLOAD_ACCESS_KEY_ID', 'R2_UPLOAD_SECRET_ACCESS_KEY'), bucket: prodEnv.R2_PRIVATE_PROGRAM_BUCKET! },
  },
};
type Store = keyof typeof stores;

/** The object's size, or null when it is not there. */
async function sizeOf(client: S3Client, bucket: string, key: string): Promise<number | null> {
  try {
    return (await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))).ContentLength ?? 0;
  }
  catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

// ── What to copy ──
type FileCopy = { store: Store; from: string; to: string; optional?: boolean };
const files: FileCopy[] = [];

/** blog/7/<uuid>.webp on dev → blog/<live id>/<uuid>.webp on live. Other paths keep their name. */
function underId(path: string, folder: string, id: number | null): string {
  const match = path.match(/^([a-z-]+)\/\d+\/(.+)$/);
  if (!match || match[1] !== folder) return path;
  return `${folder}/${id ?? 'NEW'}/${match[2]}`;
}
const emailCopyOf = (coverPath: string) => `email/${coverPath.replace(/\.webp$/i, '')}.jpg`;

const dev = createDatabase(devEnv.DATABASE_URL!, { max: 2 });
const prod = createDatabase(prodEnv.DATABASE_URL!, { max: 2 });

try {
  console.log(`Copy website content: development → live${apply ? '' : ' (dry run: nothing is copied or changed)'}`);
  console.log(`  pictures  ${stores.public.from.bucket} → ${stores.public.to.bucket}`);
  console.log(`  PDFs      ${stores.private.from.bucket} → ${stores.private.to.bucket}\n`);

  await checkLiveDatabase(dev.db, prod.db);

  // Everything from both sides.
  const [devVolumes, devPrograms, devPosts, devRecipes, devUsers] = await Promise.all([
    dev.db.select().from(volumes), dev.db.select().from(programs), dev.db.select().from(blogPosts),
    dev.db.select().from(recipes), dev.db.select({ id: users.id, email: users.email }).from(users),
  ]);
  const [liveVolumes, livePrograms, livePosts, liveRecipes, liveUsers] = await Promise.all([
    prod.db.select().from(volumes), prod.db.select().from(programs), prod.db.select().from(blogPosts),
    prod.db.select().from(recipes), prod.db.select({ id: users.id, email: users.email }).from(users),
  ]);

  // "Created by" and similar point at the same person on live (matched by email), or nobody.
  const devEmail = new Map(devUsers.map(user => [user.id, user.email.toLowerCase()]));
  const liveUserId = new Map(liveUsers.map(user => [user.email.toLowerCase(), user.id]));
  const person = (devUserId: number | null) => (devUserId === null ? null : liveUserId.get(devEmail.get(devUserId) ?? '') ?? null);

  /** A live id for every dev row: the matching live row's, or a new one (reserved only with --apply). */
  async function idsFor<T extends { id: number }>(table: string, rows: T[], live: T[], key: (row: T) => string | number) {
    const liveByKey = new Map(live.map(row => [key(row), row.id]));
    const ids = new Map<number, { id: number | null; isNew: boolean }>();
    for (const row of rows) {
      const existing = liveByKey.get(key(row));
      ids.set(row.id, existing !== undefined ? { id: existing, isNew: false } : { id: apply ? await reserveId(table) : null, isNew: true });
    }
    return ids;
  }
  async function reserveId(table: string): Promise<number> {
    const result = await prod.db.execute<{ id: string }>(sql`select nextval(pg_get_serial_sequence(${`public.${table}`}, 'id')) as id`);
    return Number(result[0]!.id);
  }

  const volumeIds = await idsFor('volumes', devVolumes, liveVolumes, row => row.number);
  const postIds = await idsFor('blog_posts', devPosts, livePosts, row => row.slug);
  const recipeIds = await idsFor('recipes', devRecipes, liveRecipes, row => row.slug);
  const programIds = await idsFor('programs', devPrograms, livePrograms, row => row.slug);
  const liveId = (ids: Map<number, { id: number | null }>, devId: number) => ids.get(devId)!.id;

  // Rows as they will be on live, with their files under the live ids.
  const now = new Date();
  const volumeRows = devVolumes.map(({ id, createdBy, updatedBy, ...row }) => ({
    ...row, id: liveId(volumeIds, id), createdBy: person(createdBy), updatedBy: person(updatedBy), updatedAt: now,
  }));
  const postRows = devPosts.map(({ id, createdBy, coverImagePath, ...row }) => {
    const target = liveId(postIds, id);
    const cover = coverImagePath ? underId(coverImagePath, 'blog', target) : null;
    if (coverImagePath && cover) {
      files.push({ store: 'public', from: coverImagePath, to: cover });
      // The JPEG copy for newsletters; the admin makes it again if it is missing.
      files.push({ store: 'public', from: emailCopyOf(coverImagePath), to: emailCopyOf(cover), optional: true });
    }
    return { ...row, id: target, coverImagePath: cover, createdBy: person(createdBy), updatedAt: now };
  });
  const recipeRows = devRecipes.map(({ id, createdBy, imagePath, blogPostId, ...row }) => {
    const target = liveId(recipeIds, id);
    const image = imagePath ? underId(imagePath, 'kitchen', target) : null;
    if (imagePath && image) files.push({ store: 'public', from: imagePath, to: image });
    return { ...row, id: target, imagePath: image, blogPostId: blogPostId === null ? null : liveId(postIds, blogPostId), createdBy: person(createdBy), updatedAt: now };
  });
  const programRows = devPrograms.map(({ id, createdBy, updatedBy, fileUploadedBy, volumeId, filePath, preview, ...row }) => {
    const target = liveId(programIds, id);
    const file = filePath ? underId(filePath, 'programs', target) : null;
    if (filePath && file) files.push({ store: 'private', from: filePath, to: file });
    let livePreview: ProgramPreviewData | null = null;
    if (preview) {
      livePreview = { ...preview, pages: preview.pages.map(page => ({ ...page, path: underId(page.path, 'program-previews', target) })) };
      preview.pages.forEach((page, index) => files.push({ store: 'public', from: page.path, to: livePreview!.pages[index]!.path }));
    }
    return {
      // Ids are only empty in a dry run, which never writes rows.
      ...row, id: target, volumeId: liveId(volumeIds, volumeId)!, filePath: file, preview: livePreview,
      createdBy: person(createdBy), updatedBy: person(updatedBy), fileUploadedBy: person(fileUploadedBy), updatedAt: now,
    };
  });

  // Live content that dev does not have.
  const devSlugs = { posts: new Set(devPosts.map(row => row.slug)), recipes: new Set(devRecipes.map(row => row.slug)), programs: new Set(devPrograms.map(row => row.slug)) };
  const extra = {
    programs: livePrograms.filter(row => !devSlugs.programs.has(row.slug)),
    recipes: liveRecipes.filter(row => !devSlugs.recipes.has(row.slug)),
    posts: livePosts.filter(row => !devSlugs.posts.has(row.slug)),
    volumes: liveVolumes.filter(row => !devVolumes.some(volume => volume.number === row.number)),
  };

  // ── The plan ──
  const plan = (label: string, rows: { slug?: string; number?: number; name?: string; title?: string }[], ids: Map<number, { isNew: boolean }>, devRows: { id: number }[], gone: { slug?: string; number?: number }[]) => {
    const isNew = devRows.map(row => ids.get(row.id)!.isNew);
    console.log(`${label}: ${isNew.filter(Boolean).length} new, ${isNew.filter(value => !value).length} updated${gone.length ? `, ${gone.length} only on live` : ''}`);
    rows.forEach((row, index) => console.log(`  ${isNew[index] ? '+ new    ' : '~ update '} ${row.slug ?? `Volume ${row.number}`}${row.slug && (row.name || row.title) ? `  (${row.name ?? row.title})` : ''}`));
    for (const row of gone) console.log(`  ${prune ? '- remove ' : '  keep   '} ${row.slug ?? `Volume ${row.number}`}  (only on live${prune ? '' : '; --prune removes it'})`);
  };
  plan('Volumes', volumeRows, volumeIds, devVolumes, extra.volumes);
  plan('Programs', programRows, programIds, devPrograms, extra.programs);
  plan('Blog posts', postRows, postIds, devPosts, extra.posts);
  plan('Kitchen recipes', recipeRows, recipeIds, devRecipes, extra.recipes);

  // ── Files first ──
  console.log(`\nFiles: ${files.filter(file => !file.optional).length} (plus newsletter copies of covers where dev has them)`);
  const failed: string[] = [];
  let copied = 0;
  let already = 0;
  for (const file of files) {
    const { from, to } = stores[file.store];
    try {
      if (!apply) {
        if (!file.optional) console.log(`  ${file.store === 'private' ? 'PDF    ' : 'picture'} ${file.from} → ${file.to}`);
        continue;
      }
      const sourceSize = await sizeOf(from.client, from.bucket, file.from);
      if (sourceSize === null) {
        if (!file.optional) {
          failed.push(file.from);
          console.error(`  MISSING on dev: ${file.from}`);
        }
        continue;
      }
      if (await sizeOf(to.client, to.bucket, file.to) === sourceSize) {
        already += 1;
        continue;
      }
      const source = await from.client.send(new GetObjectCommand({ Bucket: from.bucket, Key: file.from }));
      const data = Buffer.from(await source.Body!.transformToByteArray());
      await to.client.send(new PutObjectCommand({
        Bucket: to.bucket, Key: file.to, Body: data, ContentLength: data.length,
        ContentType: source.ContentType ?? (file.store === 'private' ? 'application/pdf' : 'application/octet-stream'),
        ...(file.store === 'public' ? { CacheControl: CACHE_FOREVER } : {}),
      }));
      copied += 1;
      console.log(`  copied ${file.to}`);
    }
    catch (error) {
      failed.push(file.from);
      console.error(`  FAILED ${file.from}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (apply) console.log(`  Copied ${copied}, already there ${already}.`);
  if (failed.length) {
    fail(`${failed.length} file(s) could not be copied (listed above).`,
      'No database rows were changed. Fix that and run again; files already copied are skipped.');
  }

  if (!apply) {
    console.log('\nDry run only. Run again with --apply to copy all of this to the live website.');
    process.exit(0);
  }

  // ── Then the rows, all together ──
  await prod.db.transaction(async tx => {
    const upsert = async <T extends { id: number | null }>(
      rows: T[], ids: Map<number, { isNew: boolean }>, devRows: { id: number }[],
      insert: (row: T & { id: number }) => Promise<unknown>, update: (row: T & { id: number }) => Promise<unknown>,
    ) => {
      for (const [index, row] of rows.entries()) {
        const withId = row as T & { id: number };
        await (ids.get(devRows[index]!.id)!.isNew ? insert(withId) : update(withId));
      }
    };
    await upsert(volumeRows, volumeIds, devVolumes,
      row => tx.insert(volumes).overridingSystemValue().values(row),
      ({ id, ...row }) => tx.update(volumes).set(row).where(eq(volumes.id, id)));
    await upsert(postRows, postIds, devPosts,
      row => tx.insert(blogPosts).overridingSystemValue().values(row),
      ({ id, ...row }) => tx.update(blogPosts).set(row).where(eq(blogPosts.id, id)));
    await upsert(recipeRows, recipeIds, devRecipes,
      row => tx.insert(recipes).overridingSystemValue().values(row),
      ({ id, ...row }) => tx.update(recipes).set(row).where(eq(recipes.id, id)));
    await upsert(programRows, programIds, devPrograms,
      row => tx.insert(programs).overridingSystemValue().values(row),
      ({ id, ...row }) => tx.update(programs).set(row).where(eq(programs.id, id)));

    if (prune) {
      if (extra.programs.length) await tx.delete(programs).where(inArray(programs.id, extra.programs.map(row => row.id)));
      if (extra.recipes.length) await tx.delete(recipes).where(inArray(recipes.id, extra.recipes.map(row => row.id)));
      if (extra.posts.length) await tx.delete(blogPosts).where(inArray(blogPosts.id, extra.posts.map(row => row.id)));
      if (extra.volumes.length) await tx.delete(volumes).where(inArray(volumes.id, extra.volumes.map(row => row.id)));
    }
  });

  console.log('\nDone. The live database now has the development content. Check the live website and admin.');
}
finally {
  await Promise.all([dev.close(), prod.close()]);
}

/** Stops unless the live database is ready: same columns as dev, and no orders yet. */
async function checkLiveDatabase(source: Database, target: Database) {
  const columns = (db: Database) => db.execute<{ table_name: string; column_name: string }>(sql`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public'`);
  const [devColumns, liveColumns] = await Promise.all([columns(source), columns(target)]);
  const live = new Set(liveColumns.map(row => `${row.table_name}.${row.column_name}`));
  const missing = devColumns.map(row => `${row.table_name}.${row.column_name}`).filter(column => !live.has(column));
  if (missing.length) fail(`The live database is missing ${missing.length} column(s) the development one has (e.g. ${missing.slice(0, 3).join(', ')}). Run the migrations on the live database first.`);

  const [{ value: orderCount }] = await target.select({ value: count() }).from(orders) as [{ value: number }];
  if (orderCount > 0) {
    fail(`The live database already has ${orderCount} order(s), so the website is already selling. Edit content in the live admin instead of copying it over.`);
  }
}
