import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const adminEnvironmentFile = fileURLToPath(
  new URL('../../../../apps/admin/.env', import.meta.url),
);
const migrationsFolder = fileURLToPath(
  new URL('../../../../supabase/migrations', import.meta.url),
);

if (existsSync(adminEnvironmentFile)) {
  loadEnvFile(adminEnvironmentFile);
}

const databaseUrl = process.env.DATABASE_URL || process.env.NUXT_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'Missing DATABASE_URL or NUXT_DATABASE_URL. Pass it inline or add NUXT_DATABASE_URL to apps/admin/.env.',
  );
}

if (databaseUrl.includes('YOUR_PASSWORD') || databaseUrl.includes('PROJECT_REF')) {
  throw new Error('The database connection string still contains placeholder values.');
}

const client = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 15,
});

try {
  const database = drizzle(client);
  await migrate(database, { migrationsFolder });
  console.info('Database migrations applied successfully.');
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown migration error';
  console.error(`Database migration failed: ${message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
