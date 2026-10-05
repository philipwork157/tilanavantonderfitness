import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// Connection string comes from the admin's private env file (never committed).
const envFile = '../../apps/admin/.env';
if (existsSync(envFile)) process.loadEnvFile(envFile);

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
