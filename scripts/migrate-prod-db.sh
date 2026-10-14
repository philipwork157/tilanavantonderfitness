#!/usr/bin/env bash
# Runs the database migrations on the LIVE database, by hand (never in the pipeline).
# Uses DATABASE_URL from apps/admin-next/.env.prod; the value is never printed.
#
# Run from the repo root:   bash scripts/migrate-prod-db.sh
# Take a backup first:      bash scripts/backup-prod-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=apps/admin-next/.env.prod
DB_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)
[ -n "$DB_URL" ] || { echo "DATABASE_URL is missing in $ENV_FILE"; exit 1; }
DEV_URL=$(grep -E '^DATABASE_URL=' apps/admin-next/.env.local | head -1 | cut -d= -f2- || true)
[ "$DB_URL" != "$DEV_URL" ] || { echo ".env.prod has the same DATABASE_URL as .env.local. Stopping."; exit 1; }

if ! ls backups/prod-*.dump >/dev/null 2>&1; then
  echo "No backup found in backups/. Run: bash scripts/backup-prod-db.sh"
  exit 1
fi
echo "Latest backup: $(ls -t backups/prod-*.dump | head -1)"
read -r -p "Run the migrations on the LIVE database now? Type 'live' to continue: " answer
[ "$answer" = "live" ] || { echo "Stopped. Nothing was changed."; exit 1; }

# drizzle.config.ts loads .env.local, but a DATABASE_URL already set here wins.
DATABASE_URL="$DB_URL" pnpm --filter @tilana/db db:migrate
echo "Migrations applied to the live database."
