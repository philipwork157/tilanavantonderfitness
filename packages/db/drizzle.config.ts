import { defineConfig } from 'drizzle-kit';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

const adminEnvironmentFile = '../../apps/admin/.env';
if (existsSync(adminEnvironmentFile)) loadEnvFile(adminEnvironmentFile);

const databaseUrl = process.env.DATABASE_URL || process.env.NUXT_DATABASE_URL;

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: '../../supabase/migrations',
  migrations: {
    prefix: 'timestamp',
  },
  ...(databaseUrl ? { dbCredentials: { url: databaseUrl } } : {}),
  strict: true,
  verbose: true,
});
