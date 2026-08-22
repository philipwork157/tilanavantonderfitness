import { createDatabase, type Database } from '@tilana/db/server';

let database: Database | undefined;

export function getDatabase(): Database {
  if (database) return database;

  const { databaseUrl } = useRuntimeConfig();

  if (!databaseUrl) {
    throw createError({
      statusCode: 503,
      statusMessage: 'The contact service is not configured.',
    });
  }

  database = createDatabase(databaseUrl);
  return database;
}

