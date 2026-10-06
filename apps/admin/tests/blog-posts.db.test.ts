/** Database tests for blog posts. Need TEST_DATABASE_URL (throwaway Postgres). */
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { blogPosts, createDatabase, type Database } from '@tilana/db';
import { listPublishedPosts, uniqueSlug } from '../server/services/blog-posts';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('blog posts (database)', () => {
  let db: Database;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ db, close } = createDatabase(url!, { max: 1 }));
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../../packages/db/migrations', import.meta.url)) });
  });

  beforeEach(async () => {
    await db.execute(sql`truncate table blog_posts restart identity cascade`);
  });

  afterAll(async () => {
    await close?.();
  });

  it('creates unique slugs', async () => {
    expect(await uniqueSlug(db, 'My Post')).toBe('my-post');
    await db.insert(blogPosts).values([{ title: 'a', slug: 'my-post' }, { title: 'b', slug: 'my-post-2' }]);
    expect(await uniqueSlug(db, 'My Post')).toBe('my-post-3');
    expect(await uniqueSlug(db, 'My Post', 1)).toBe('my-post');
  });

  it('only lists published posts, newest first', async () => {
    await db.insert(blogPosts).values([
      { title: 'Old', slug: 'old', status: 'published', publishedAt: new Date('2026-01-01') },
      { title: 'Draft', slug: 'draft' },
      { title: 'New', slug: 'new', status: 'published', publishedAt: new Date('2026-09-01') },
    ]);
    expect((await listPublishedPosts(db)).map(post => post.slug)).toEqual(['new', 'old']);
  });

  it('enforces slug format and a date on published posts', async () => {
    await expect(db.insert(blogPosts).values({ title: 'x', slug: 'Bad Slug' })).rejects.toThrow();
    await expect(db.insert(blogPosts).values({ title: 'x', slug: 'ok', status: 'published' })).rejects.toThrow();
  });
});
