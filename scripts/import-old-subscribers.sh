#!/usr/bin/env bash
# Brings the newsletter subscribers from the OLD live database into the new one,
# using the backup that scripts/reset-db.sh (backup-prod-db.sh) took before the reset.
#
#   bash scripts/import-old-subscribers.sh                         newest backups/prod-*.sql
#   bash scripts/import-old-subscribers.sh backups/prod-....sql    a specific backup
#
# Only people still "subscribed" come across. Each gets a new unsubscribe link;
# their original consent and confirmation dates are kept. People already in the
# new table are skipped, so running it twice is safe. Emails are never printed,
# only counts. Uses DATABASE_URL from apps/admin-next/.env.prod. Needs psql.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=apps/admin-next/.env.prod
BACKUP="${1:-$(ls -t backups/prod-*.sql 2>/dev/null | head -1 || true)}"
[ -n "$BACKUP" ] && [ -f "$BACKUP" ] || { echo "No backup found. Pass one: bash scripts/import-old-subscribers.sh backups/prod-....sql" >&2; exit 1; }
command -v psql >/dev/null || { echo "psql not found: brew install postgresql@17 && brew link --force postgresql@17" >&2; exit 1; }
DB_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
[ -n "$DB_URL" ] || { echo "DATABASE_URL is missing in $ENV_FILE" >&2; exit 1; }
sql() { PGOPTIONS="-c client_min_messages=warning" psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -At "$@"; }

[ "$(sql -c "select to_regclass('public.newsletter_subscribers') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'newsletter_subscribers' and column_name = 'unsubscribe_token')")" = t ] \
  || { echo "The live database does not have the new newsletter table yet. Run the reset/migrations first." >&2; exit 1; }

ROWS="$(grep -c '^INSERT INTO public.newsletter_subscribers ' "$BACKUP" || true)"
[ "$ROWS" -gt 0 ] || { echo "$BACKUP has no newsletter subscribers." >&2; exit 1; }
COLUMNS="$(grep -m1 '^INSERT INTO public.newsletter_subscribers ' "$BACKUP" | sed -E 's/^INSERT INTO public\.newsletter_subscribers \(([^)]*)\).*/\1/')"
echo "Backup: $BACKUP ($ROWS subscriber rows)"
echo "Into:   the live database in $ENV_FILE (currently $(sql -c "select count(*) from public.newsletter_subscribers") subscribers)"
read -r -p "Import the ones still subscribed? [y/N] " answer
[ "$answer" = y ] || { echo "Nothing changed."; exit 0; }

# The old rows go into a temporary table (every column as text), then across
# with the same rules as the new sign-up flow. One transaction: all or nothing.
{
  echo "begin;"
  echo "create temporary table old_subscribers ($(printf '%s' "$COLUMNS" | sed -E 's/([a-z_]+)/\1 text/g')) on commit drop;"
  grep '^INSERT INTO public.newsletter_subscribers ' "$BACKUP" | sed 's/^INSERT INTO public\.newsletter_subscribers /INSERT INTO old_subscribers /'
  cat <<'SQL'
insert into public.newsletter_subscribers
  (email, status, source, consented_at, confirmed_at, unsubscribe_token, created_at, updated_at)
select
  lower(trim(old.email)),
  'subscribed',
  coalesce(nullif(j->>'source', ''), 'website-footer'),
  coalesce((j->>'consented_at')::timestamptz, (j->>'confirmed_at')::timestamptz, (j->>'created_at')::timestamptz, now()),
  coalesce((j->>'confirmed_at')::timestamptz, (j->>'consented_at')::timestamptz, (j->>'created_at')::timestamptz, now()),
  replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  coalesce((j->>'created_at')::timestamptz, now()),
  now()
from old_subscribers old
cross join lateral (select to_jsonb(old) as j) row_data
where old.status = 'subscribed' and coalesce(trim(old.email), '') <> ''
on conflict (email) do nothing;
commit;
SQL
} | sql

echo "Done. Subscribed now: $(sql -c "select count(*) from public.newsletter_subscribers where status = 'subscribed'")"
