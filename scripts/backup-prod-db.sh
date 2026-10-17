#!/usr/bin/env bash
# Read-only backup of the LIVE database (public schema): one .sql file with
# CREATE TABLE statements and an INSERT for every row, plus a .dump file for
# an exact restore with pg_restore. Nothing on the live database is changed.
#
# Run from the repo root:   bash scripts/backup-prod-db.sh
# Needs pg_dump 17:         brew install postgresql@17 && brew link --force postgresql@17
# Files go to backups/ (git-ignored). They contain customer data: keep them private.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=apps/admin-next/.env.prod
DB_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)
[ -n "$DB_URL" ] || { echo "DATABASE_URL is missing in $ENV_FILE"; exit 1; }
command -v pg_dump >/dev/null || { echo "pg_dump not found. Install it: brew install postgresql@17 && brew link --force postgresql@17"; exit 1; }

mkdir -p backups && chmod 700 backups
STAMP=$(date +%Y-%m-%d-%H%M)
SQL="backups/prod-$STAMP.sql"
DUMP="backups/prod-$STAMP.dump"

echo "Exporting the live database (public schema)..."
pg_dump "$DB_URL" --schema=public --no-owner --no-privileges --column-inserts --file "$SQL"
pg_dump "$DB_URL" --schema=public --no-owner --no-privileges --format=custom --file "$DUMP"
chmod 600 "$SQL" "$DUMP"

echo
echo "Saved: $SQL ($(du -h "$SQL" | cut -f1)) and $DUMP"
echo
echo "Tables and row counts in the backup:"
grep -oE '^CREATE TABLE public\.[A-Za-z0-9_"]+' "$SQL" | sed 's/CREATE TABLE public\.//' | while read -r t; do
  n=$(grep -cE "^INSERT INTO public\.$t " "$SQL" || true)
  printf '  %-40s %s rows\n' "$t" "$n"
done
