/**
 * One-off, once per environment: move files into the two Cloudflare R2 buckets.
 *
 *   pnpm storage:move --dry-run --from-private tilanavantonder-dev-private-programs
 *   pnpm storage:move --from-private tilanavantonder-dev-private-programs
 *
 * 1. With --from-private <old bucket>: copies every file (the program PDFs)
 *    from the old private bucket to R2_PRIVATE_PROGRAM_BUCKET. PDFs still in
 *    the old volumes/<id>/ folder move to programs/<program id>/ like the
 *    others, and their path in the database is updated; volumes/ files no
 *    program uses are left behind. Everything else keeps its name. The upload token (R2_UPLOAD_*) needs Object Read & Write
 *    on both buckets for this.
 * 2. Copies the website pictures from Supabase Storage to R2_PUBLIC_BUCKET,
 *    into the new folders, and updates their paths in the database:
 *      posts/...    → blog/...              (blog covers)
 *      recipes/...  → kitchen/...           (recipe photos)
 *      programs/... → program-previews/...  ("Peek inside" pages)
 *    The JPEG copies of covers for emails are not copied: the admin makes them
 *    again when a newsletter needs one.
 *
 * Safe to run more than once: anything already moved is skipped. Nothing is
 * deleted. Reads apps/admin-next/.env.local.
 */
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { eq, isNotNull } from 'drizzle-orm';
import { createDatabase } from '../src/client';
import { blogPosts, programs, recipes, type ProgramPreviewData } from '../src/schema';

const envFile = '../../apps/admin-next/.env.local';
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false }, 'from-private': { type: 'string' } } });
const dryRun = values['dry-run'];
const oldPrivateBucket = values['from-private']?.trim();

const required = [
  'DATABASE_URL', 'SUPABASE_URL', 'R2_ACCOUNT_ID',
  'R2_PUBLIC_BUCKET', 'R2_PUBLIC_ACCESS_KEY_ID', 'R2_PUBLIC_SECRET_ACCESS_KEY',
  ...(oldPrivateBucket ? ['R2_PRIVATE_PROGRAM_BUCKET', 'R2_UPLOAD_ACCESS_KEY_ID', 'R2_UPLOAD_SECRET_ACCESS_KEY'] : []),
];
const missing = required.filter(name => !process.env[name]);
if (missing.length) {
  console.error(`Set these in apps/admin-next/.env.local first: ${missing.join(', ')}`);
  process.exit(1);
}
const env = (name: string) => process.env[name]!;

const endpoint = `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`;
const r2Client = (keyId: string, secret: string) =>
  new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId: keyId, secretAccessKey: secret } });
const CACHE_FOREVER = 'public, max-age=31536000, immutable';
const failed: string[] = [];

async function exists(client: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  }
  catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return false;
    throw error;
  }
}

const { db, close } = createDatabase(env('DATABASE_URL'));
let updated = 0;

// ── 1. PDFs: old private bucket → new private bucket ──
if (oldPrivateBucket) {
  const newPrivateBucket = env('R2_PRIVATE_PROGRAM_BUCKET');
  if (oldPrivateBucket === newPrivateBucket) {
    console.error('--from-private is the same bucket as R2_PRIVATE_PROGRAM_BUCKET. Set R2_PRIVATE_PROGRAM_BUCKET to the new bucket first.');
    process.exit(1);
  }
  const r2 = r2Client(env('R2_UPLOAD_ACCESS_KEY_ID'), env('R2_UPLOAD_SECRET_ACCESS_KEY'));
  console.log(`PDFs: ${oldPrivateBucket} → ${newPrivateBucket}`);
  // PDFs from before volumes held programs: volumes/6/v1-x.pdf → programs/<program id>/v1-x.pdf.
  const renames = new Map<string, { programId: number; key: string }>();
  for (const program of await db.select({ id: programs.id, path: programs.filePath }).from(programs).where(isNotNull(programs.filePath))) {
    if (program.path!.startsWith('volumes/')) {
      renames.set(program.path!, { programId: program.id, key: `programs/${program.id}/${program.path!.split('/').pop()}` });
    }
  }
  const moved: { programId: number; key: string }[] = [];
  let copied = 0;
  let skipped = 0;
  let token: string | undefined;
  do {
    const page = await r2.send(new ListObjectsV2Command({ Bucket: oldPrivateBucket, ContinuationToken: token }));
    for (const { Key: key } of page.Contents ?? []) {
      if (!key) continue;
      const rename = renames.get(key);
      // Old volumes/ files no program uses any more (or already moved on an earlier run) stay behind.
      if (key.startsWith('volumes/') && !rename) {
        console.log(`  left behind ${key} (no program uses it)`);
        continue;
      }
      const target = rename?.key ?? key;
      try {
        if (await exists(r2, newPrivateBucket, target)) {
          skipped += 1;
        }
        else {
          if (!dryRun) {
            const source = await r2.send(new GetObjectCommand({ Bucket: oldPrivateBucket, Key: key }));
            const data = Buffer.from(await source.Body!.transformToByteArray());
            await r2.send(new PutObjectCommand({ Bucket: newPrivateBucket, Key: target, Body: data, ContentType: source.ContentType ?? 'application/pdf', ContentLength: data.length }));
          }
          copied += 1;
          console.log(`  ${dryRun ? 'would copy' : 'copied'} ${key}${target === key ? '' : ` → ${target}`}`);
        }
        if (rename) moved.push(rename);
      }
      catch (error) {
        failed.push(key);
        console.error(`  FAILED ${key}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    token = page.NextContinuationToken;
  } while (token);
  console.log(`  ${dryRun ? 'Would copy' : 'Copied'} ${copied}, already there ${skipped}.`);
  for (const { programId, key } of moved) {
    if (!dryRun) await db.update(programs).set({ filePath: key }).where(eq(programs.id, programId));
    updated += 1;
    console.log(`  ${dryRun ? 'would point' : 'pointed'} program ${programId} at ${key}`);
  }
}

// ── 2. Pictures: Supabase Storage → public bucket, new folders ──
const publicBucket = env('R2_PUBLIC_BUCKET');
const r2 = r2Client(env('R2_PUBLIC_ACCESS_KEY_ID'), env('R2_PUBLIC_SECRET_ACCESS_KEY'));
const supabaseUrl = env('SUPABASE_URL').replace(/\/+$/, '');

/** Old Supabase folder → new R2 folder. */
const FOLDERS = [
  { bucket: 'blog-images', from: 'posts/', to: 'blog/' },
  { bucket: 'blog-images', from: 'recipes/', to: 'kitchen/' },
  { bucket: 'program-previews', from: 'programs/', to: 'program-previews/' },
] as const;

/** Where a stored path lives now (Supabase, old name) and where it goes (R2, new name). */
function locate(path: string, kind: 0 | 1 | 2) {
  const folder = FOLDERS[kind];
  const name = path.startsWith(folder.to) ? path.slice(folder.to.length) : path.startsWith(folder.from) ? path.slice(folder.from.length) : null;
  if (name === null) throw new Error(`unexpected path ${path}`);
  return { source: `${folder.bucket}/${folder.from}${name}`, target: `${folder.to}${name}` };
}

/** Makes sure the picture is in R2 under its new name. Returns that name, or null if it failed. */
async function movePicture(path: string, kind: 0 | 1 | 2): Promise<string | null> {
  const { source, target } = locate(path, kind);
  try {
    if (await exists(r2, publicBucket, target)) return target;
    if (dryRun) {
      console.log(`  would copy ${source} → ${target}`);
      return target;
    }
    const response = await fetch(`${supabaseUrl}/storage/v1/object/public/${source.split('/').map(encodeURIComponent).join('/')}`);
    if (!response.ok) throw new Error(`Supabase answered ${response.status}`);
    const data = Buffer.from(await response.arrayBuffer());
    await r2.send(new PutObjectCommand({ Bucket: publicBucket, Key: target, Body: data, ContentType: target.endsWith('.jpg') ? 'image/jpeg' : 'image/webp', ContentLength: data.length, CacheControl: CACHE_FOREVER }));
    console.log(`  copied ${source} → ${target}`);
    return target;
  }
  catch (error) {
    failed.push(source);
    console.error(`  FAILED ${source}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

console.log(`Pictures: Supabase Storage → ${publicBucket}${dryRun ? ' (dry run: nothing is copied or changed)' : ''}`);
try {
  for (const post of await db.select({ id: blogPosts.id, path: blogPosts.coverImagePath }).from(blogPosts).where(isNotNull(blogPosts.coverImagePath))) {
    const target = await movePicture(post.path!, 0);
    if (target && target !== post.path) {
      if (!dryRun) await db.update(blogPosts).set({ coverImagePath: target }).where(eq(blogPosts.id, post.id));
      updated += 1;
    }
  }
  for (const recipe of await db.select({ id: recipes.id, path: recipes.imagePath }).from(recipes).where(isNotNull(recipes.imagePath))) {
    const target = await movePicture(recipe.path!, 1);
    if (target && target !== recipe.path) {
      if (!dryRun) await db.update(recipes).set({ imagePath: target }).where(eq(recipes.id, recipe.id));
      updated += 1;
    }
  }
  for (const program of await db.select({ id: programs.id, preview: programs.preview }).from(programs).where(isNotNull(programs.preview))) {
    const preview = program.preview as ProgramPreviewData;
    const pages: ProgramPreviewData['pages'] = [];
    for (const page of preview.pages) {
      const target = await movePicture(page.path, 2);
      if (!target) break;
      pages.push({ ...page, path: target });
    }
    // Only point the program at the new pictures once every page is there.
    if (pages.length === preview.pages.length && pages.some((page, index) => page.path !== preview.pages[index]!.path)) {
      if (!dryRun) await db.update(programs).set({ preview: { ...preview, pages } }).where(eq(programs.id, program.id));
      updated += 1;
    }
  }
}
finally {
  await close();
}

console.log(`  ${dryRun ? 'Would update' : 'Updated'} ${updated} database rows.`);
if (failed.length) {
  console.error(`${failed.length} file(s) failed (listed above). Fix and run again; finished ones are skipped.`);
  process.exit(1);
}
console.log('Done.');
