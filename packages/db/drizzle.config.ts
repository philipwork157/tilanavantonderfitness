import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// Connection string comes from the repository-root .env (never committed).
if (existsSync('../../.env')) process.loadEnvFile('../../.env');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  dbCredentials: { url: process.env.NUXT_DATABASE_URL ?? '' },
  // Only manage our own tables; never touch Supabase-managed schemas.
  schemaFilter: ['public'],
  strict: true,
  verbose: true,
});
