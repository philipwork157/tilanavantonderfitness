import { createDatabase, type Database } from '@tilana/db';

let database: Database | undefined;

/** One shared connection pool per server process. */
export function useDatabase(): Database {
  if (database) return database;
  const { databaseUrl } = useRuntimeConfig();
  if (!databaseUrl) {
    throw createError({ statusCode: 503, statusMessage: 'The database is not configured yet.' });
  }
  database = createDatabase(databaseUrl).db;
  return database;
}
