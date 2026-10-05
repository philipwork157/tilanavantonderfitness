import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export function createDatabase(connectionString: string, options: { max?: number } = {}) {
  const client = postgres(connectionString, {
    // Supabase's transaction pooler does not support prepared statements.
    prepare: false,
    max: options.max ?? 5,
  });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

export type Database = ReturnType<typeof createDatabase>['db'];
