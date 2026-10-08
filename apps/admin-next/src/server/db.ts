import 'server-only';
import { createDatabase, type Database } from '@tilana/db';
import { serverConfig } from './config';
import { HttpError } from './http';

// Kept on globalThis so `next dev` reuses the pool when it reloads this
// module after a save. Otherwise every save opened a new pool and the old
// connections stayed open, filling up Supabase's session pooler.
const shared = globalThis as typeof globalThis & { tilanaDatabase?: Database };

/** One shared connection pool per server process. */
export function getDatabase(): Database {
  if (shared.tilanaDatabase) return shared.tilanaDatabase;
  const { databaseUrl } = serverConfig();
  if (!databaseUrl) throw new HttpError(503, 'The database is not configured yet.');
  shared.tilanaDatabase = createDatabase(databaseUrl).db;
  return shared.tilanaDatabase;
}
