# Database package

`@tilana/db` is the server-only data layer for the Nuxt backend.

## Layout

- `src/schema/`: Drizzle table definitions, constraints, indexes, and RLS state. Use one file per domain table and re-export it from `schema/index.ts`.
- `src/types/`: row and insert types inferred directly from Drizzle schemas. Do not hand-maintain duplicate database interfaces.
- `src/server.ts`: PostgreSQL/Drizzle client factory. Import it only from Nuxt server code.
- `src/scripts/migrate.ts`: server-only migration runner used by `db:migrate` and `db:apply`.
- `drizzle.config.ts`: migration generation configuration.
- `../../supabase/migrations/`: reviewed SQL and Drizzle snapshots committed to Git.

API payload schemas do not belong here. They live in `@tilana/contracts`, because HTTP input is not the same thing as a database row.

The platform entity model and purchase/invoice flows are documented in [`../../docs/database-design.md`](../../docs/database-design.md).

## RLS model

Application tables enable PostgreSQL row-level security in their Drizzle definitions. The Nuxt backend currently connects with a privileged Supabase database role, so its trusted server queries bypass RLS. No anonymous table policies are created.

When end-user access is introduced, add explicit least-privilege policies for authenticated Supabase users. Never expose the database URL or Supabase service-role key to Astro or browser code.

## Schema workflow

1. Change a schema in `src/schema`.
2. Run `pnpm db:generate` from the repository root.
3. Review the generated SQL in `supabase/migrations`.
4. Run `pnpm db:check` and `pnpm check`.
5. Apply the reviewed migrations with `pnpm db:migrate`.

`pnpm db:apply` combines generation and migration for local development. For production, prefer generating and reviewing the SQL first, then run `db:migrate` as a separate deployment step.

The runner accepts `DATABASE_URL` first and falls back to `NUXT_DATABASE_URL` from `apps/admin/.env`. Use Supabase's direct database connection for migrations when it is reachable from your environment; keep the transaction pooler URL for serverless application traffic.
