/**
 * ONE-TIME: copy the original Markdown blog posts (apps/web/src/content/blog)
 * and their photos into the blog_posts table and Supabase Storage.
 *
 *   pnpm --filter @tilana/admin blog:import-legacy
 *
 * Safe to re-run: posts whose slug already exists are skipped. Delete this
 * script and the old Markdown files once the import is confirmed.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { blogPosts, createDatabase } from '@tilana/db';
import { BLOG_CATEGORIES, type BlogCategory } from '@tilana/contracts/blog';

if (existsSync('.env')) process.loadEnvFile('.env');
const { NUXT_DATABASE_URL, NUXT_SUPABASE_URL, NUXT_SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NUXT_DATABASE_URL || !NUXT_SUPABASE_URL || !NUXT_SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set NUXT_DATABASE_URL, NUXT_SUPABASE_URL and NUXT_SUPABASE_SERVICE_ROLE_KEY in apps/admin/.env.');
  process.exit(1);
}

const CONTENT_DIR = '../web/src/content/blog';
const PUBLIC_DIR = '../web/public';
const FALLBACK_IMAGES: Record<string, string> = { 'welcome-a-little-about-me': '/tilana-blog-welcome.jpg' };
const BUCKET = 'blog-images';

const stripTags = (html: string) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const unquote = (text: string) => text.replace(/^[“"]+|[”"]+$/g, '').trim();

function parseFrontmatter(source: string) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(source);
  if (!match) throw new Error('Missing frontmatter');
  const data: Record<string, string> = {};
  for (const line of match[1]!.split('\n')) {
    const field = /^(\w+):\s*(.*)$/.exec(line);
    if (field) data[field[1]!] = field[2]!.trim().replace(/^"(.*)"$/, '$1');
  }
  return { data, body: match[2]! };
}

/** Turn the hand-written HTML blocks into plain Markdown plus separate fields. */
function convertBody(body: string) {
  let markdown = body;
  let closingLine: string | null = null;
  let quoteText: string | null = null;
  let quoteCitation: string | null = null;

  markdown = markdown.replace(/<p class="article-intro">([\s\S]*?)<\/p>/, (_all, inner: string) => stripTags(inner).replace(/^(\S)\s+/, '$1'));
  markdown = markdown.replace(/<div class="article-closing">([\s\S]*?)<\/div>\s*<\/div>/, (_all, inner: string) => {
    const line = /<p>([\s\S]*?)<\/p>/.exec(inner);
    closingLine = line ? stripTags(line[1]!) : null;
    return '';
  });
  markdown = markdown.replace(/<blockquote class="bible-verse">([\s\S]*?)<\/blockquote>/, (_all, inner: string) => {
    quoteText = unquote(stripTags(/<p>([\s\S]*?)<\/p>/.exec(inner)?.[1] ?? ''));
    quoteCitation = stripTags(/<cite>([\s\S]*?)<\/cite>/.exec(inner)?.[1] ?? '') || null;
    return '';
  });

  return { markdown: markdown.trim(), closingLine, quoteText, quoteCitation, leftoverHtml: /<[a-z][^>]*>/i.test(markdown) };
}

const { db, close } = createDatabase(NUXT_DATABASE_URL, { max: 1 });
const storage = createClient(NUXT_SUPABASE_URL, NUXT_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

try {
  const { data: bucket } = await storage.storage.getBucket(BUCKET);
  if (!bucket) {
    await storage.storage.createBucket(BUCKET, { public: true, fileSizeLimit: '5MB', allowedMimeTypes: ['image/webp'] });
  }

  for (const file of readdirSync(CONTENT_DIR).filter(name => name.endsWith('.md')).sort()) {
    const slug = basename(file, '.md');
    const [existing] = await db.select({ id: blogPosts.id }).from(blogPosts).where(eq(blogPosts.slug, slug));
    if (existing) {
      console.log(`- ${slug}: already imported (post #${existing.id}), skipped`);
      continue;
    }

    const { data, body } = parseFrontmatter(readFileSync(join(CONTENT_DIR, file), 'utf8'));
    const converted = convertBody(body);
    if (!BLOG_CATEGORIES.includes(data.category as BlogCategory)) throw new Error(`${slug}: unknown category ${data.category}`);

    const [post] = await db.insert(blogPosts).values({
      slug,
      title: data.title!,
      excerpt: data.description ?? '',
      category: data.category!,
      bodyMarkdown: converted.markdown,
      coverImageAlt: data.imageAlt || 'Tilana van Tonder smiling in a white shirt',
      closingLine: converted.closingLine,
      quoteText: converted.quoteText,
      quoteCitation: converted.quoteCitation,
      status: data.draft === 'true' ? 'draft' : 'published',
      publishedAt: new Date(`${data.publishedAt}T12:00:00+02:00`),
    }).returning({ id: blogPosts.id });

    const imagePath = data.image || FALLBACK_IMAGES[slug];
    if (imagePath && existsSync(join(PUBLIC_DIR, imagePath))) {
      const { data: webp, info } = await sharp(readFileSync(join(PUBLIC_DIR, imagePath)))
        .rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
      const objectPath = `posts/${post!.id}/${randomUUID()}.webp`;
      const { error } = await storage.storage.from(BUCKET).upload(objectPath, webp, { contentType: 'image/webp', cacheControl: '31536000' });
      if (error) throw new Error(`${slug}: image upload failed: ${error.message}`);
      await db.update(blogPosts).set({ coverImagePath: objectPath, coverImageWidth: info.width, coverImageHeight: info.height }).where(eq(blogPosts.id, post!.id));
    }

    console.log(`+ ${slug}: imported as post #${post!.id}${converted.leftoverHtml ? ' (WARNING: some HTML left in the text, check it in the admin)' : ''}`);
  }
}
finally {
  await close();
}
