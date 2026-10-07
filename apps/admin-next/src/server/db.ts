import 'server-only';
import { createDatabase, type Database } from '@tilana/db';
import { serverConfig } from './config';
import { HttpError } from './http';

let database: Database | undefined;

/** One shared connection pool per server process. */
export function getDatabase(): Database {
  if (database) return database;
  const { databaseUrl } = serverConfig();
  if (!databaseUrl) throw new HttpError(503, 'The database is not configured yet.');
  database = createDatabase(databaseUrl).db;
  return database;
}
