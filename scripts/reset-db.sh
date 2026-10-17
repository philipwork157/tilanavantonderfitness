#!/usr/bin/env bash
# Empties a database and builds it again from the migrations: every table in
# the public schema and drizzle's migration history are dropped, then all
# migrations run from 0000. Supabase's own schemas (auth, storage, ...) are
# never touched, so sign-in accounts stay.
#
#   bash scripts/reset-db.sh dev     uses DATABASE_URL from apps/admin-next/.env.local
#   bash scripts/reset-db.sh prod    uses DATABASE_URL from apps/admin-next/.env.prod
#
# For the LIVE database it takes a backup first (scripts/backup-prod-db.sh)
# and refuses once there is any order, so it can only be used before launch.
# You type the database name to confirm. Values are never printed.
#
# Afterwards: add yourself as admin (db:add-admin) and, for live, copy the
# content from development (pnpm content:copy). The steps are printed at the end.
# Needs psql (brew install postgresql@17). Run from the repo root.
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-}"
case "$TARGET" in
  dev)  ENV_FILE=apps/admin-next/.env.local; LABEL="DEVELOPMENT" ;;
  prod) ENV_FILE=apps/admin-next/.env.prod;  LABEL="LIVE" ;;
  *) echo "Usage: bash scripts/reset-db.sh dev|prod" >&2; exit 1 ;;
esac

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE" >&2; exit 1; }
command -v psql >/dev/null || { echo "psql not found. Install it: brew install postgresql@17 && brew link --force postgresql@17" >&2; exit 1; }
url_of() { grep -E '^DATABASE_URL=' "$1" 2>/dev/null | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }
DB_URL="$(url_of "$ENV_FILE")"
[ -n "$DB_URL" ] || { echo "DATABASE_URL is missing in $ENV_FILE" >&2; exit 1; }

if [ "$TARGET" = prod ]; then
  [ "$DB_URL" != "$(url_of apps/admin-next/.env.local)" ] || { echo "Refusing: .env.prod has the same DATABASE_URL as .env.local." >&2; exit 1; }
fi

sql() { PGOPTIONS="-c client_min_messages=warning" psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -At "$@"; }
# Rows in a table, or 0 when the table does not exist (yet).
rows_in() { if [ "$(sql -c "select to_regclass('$1') is not null")" = t ]; then sql -c "select count(*) from $1"; else echo 0; fi; }

# Where it points, without the password: user@host:port/name.
WHERE="$(printf '%s' "$DB_URL" | sed -E 's#^[a-z]+://([^:@/]+)(:[^@]*)?@([^/?]+)/([^?]*).*#\1@\3/\4#')"
DB_NAME="$(sql -c 'select current_database()')"

echo "Reset the $LABEL database: $WHERE"
echo
TABLES="$(sql -c "select tablename from pg_tables where schemaname = 'public' order by 1")"
if [ -n "$TABLES" ]; then
  echo "These tables and all their rows will be deleted:"
  while IFS= read -r table; do
    rows="$(sql -c "select count(*) from public.\"$table\"")"
    printf '  %-32s %s rows\n' "$table" "$rows"
  done <<< "$TABLES"
else
  echo "The public schema is empty (a new database)."
fi
APPLIED="$(rows_in drizzle.__drizzle_migrations)"
echo "Migrations recorded as run: $APPLIED (all will run again)"
echo

if [ "$TARGET" = prod ]; then
  ORDERS="$(rows_in public.orders)"
  if [ "$ORDERS" != 0 ]; then
    echo "Refusing: the live database has $ORDERS order(s). It is selling, so it must never be reset." >&2
    exit 1
  fi
  echo "Taking a backup first..."
  bash scripts/backup-prod-db.sh
  echo
fi

read -r -p "Type the database name ($DB_NAME) to delete everything and rebuild it: " answer
[ "$answer" = "$DB_NAME" ] || { echo "Stopped. Nothing was changed."; exit 1; }

echo "Dropping the tables..."
sql <<'SQL'
begin;
drop schema if exists drizzle cascade;
do $$
declare item record;
begin
  for item in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop table if exists public.%I cascade', item.tablename);
  end loop;
  for item in select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
              where n.nspname = 'public' and t.typtype = 'e' loop
    execute format('drop type if exists public.%I cascade', item.typname);
  end loop;
end $$;
commit;
SQL

echo "Running all migrations..."
# drizzle.config.ts loads .env.local, but a DATABASE_URL set here wins.
DATABASE_URL="$DB_URL" pnpm --filter @tilana/db db:migrate

echo
echo "Done: the $LABEL database is empty and up to date."
echo "Tables now: $(sql -c "select count(*) from pg_tables where schemaname = 'public'"), migrations run: $(sql -c 'select count(*) from drizzle.__drizzle_migrations')"
echo
echo "Next:"
if [ "$TARGET" = prod ]; then
  echo "  1. Make yourself admin (your sign-in must exist in the live Supabase project's Authentication > Users):"
  echo "     DATABASE_URL=\"\$(grep -E '^DATABASE_URL=' $ENV_FILE | cut -d= -f2-)\" pnpm db:add-admin --email you@example.com --first-name Name --last-name Surname"
  echo "  2. Copy the content from development: pnpm content:copy (dry run), then pnpm content:copy --apply --prune"
else
  echo "  1. Make yourself admin: pnpm db:add-admin --email you@example.com --first-name Name --last-name Surname"
fi
