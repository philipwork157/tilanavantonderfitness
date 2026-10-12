#!/usr/bin/env bash
# Copies the admin's settings from apps/admin-next/.env.local to the DEVELOPMENT
# admin on Fly.io (tilanavantonder-admin-dev). Never touches production.
#
#   ./scripts/fly-dev-secrets.sh https://<dev website address>
#   ./scripts/fly-dev-secrets.sh https://<dev website address> --replace
#
# Without --replace, settings with the same name are overwritten and every other
# secret already on the app is kept. With --replace, secrets that are not in
# .env.local (old ones such as NUXT_*) are removed first, so the app ends up with
# exactly these settings.
# The dev website address replaces the localhost values of WEBSITE_URL and
# WEBSITE_ORIGINS. Empty settings are skipped. Values are never printed.
set -euo pipefail

APP="tilanavantonder-admin-dev"
ENV_FILE="apps/admin-next/.env.local"
SITE="${1:-}"
REPLACE="${2:-}"
[ -z "$REPLACE" ] || [ "$REPLACE" = "--replace" ] || { echo "Unknown option: $REPLACE" >&2; exit 1; }

cd "$(dirname "$0")/.."
case "$APP" in *-dev) ;; *) echo "Refusing: $APP is not the development app." >&2; exit 1 ;; esac
SITE="${SITE%/}"
case "$SITE" in https://admin*) echo "That is the admin's address. Pass the dev WEBSITE address (the Cloudflare Worker tilanavantonder-website-dev)." >&2; exit 1 ;; esac
[[ "$SITE" =~ ^https://[a-z0-9.-]+$ ]] || { echo "Usage: $0 https://<dev website address> (https, no trailing slash)" >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE" >&2; exit 1; }
command -v fly >/dev/null || { echo "Install flyctl first: brew install flyctl" >&2; exit 1; }
fly auth whoami >/dev/null 2>&1 || { echo "Sign in first: fly auth login" >&2; exit 1; }

value() { grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }

# Development must never reach real people or take real money.
[ "$(value PAYSTACK_MODE)" = "test" ] || { echo "Refusing: PAYSTACK_MODE must be test for development." >&2; exit 1; }
case "$(value PAYSTACK_SECRET_KEY)" in sk_test_*) ;; *) echo "Refusing: PAYSTACK_SECRET_KEY must be a sk_test_ key." >&2; exit 1 ;; esac
[ -n "$(value EMAIL_DEV_REDIRECT_TO)" ] || { echo "Refusing: set EMAIL_DEV_REDIRECT_TO so dev emails only go to you." >&2; exit 1; }

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
chmod 600 "$TMP"
while IFS= read -r line; do
  [[ "$line" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]] || continue
  name="${BASH_REMATCH[1]}"
  case "$name" in WEBSITE_URL|WEBSITE_ORIGINS|NODE_ENV|PORT|HOSTNAME) continue ;; esac
  val="$(value "$name")"
  [ -n "$val" ] && printf '%s=%s\n' "$name" "$val" >> "$TMP"
done < "$ENV_FILE"
printf 'WEBSITE_URL=%s\nWEBSITE_ORIGINS=%s\n' "$SITE" "$SITE" >> "$TMP"

echo "Setting these on $APP (values hidden):"
cut -d= -f1 "$TMP" | sed 's/^/  /'

OLD=()
if [ "$REPLACE" = "--replace" ]; then
  # Names already on the app (the JSON list holds names and dates, never values).
  existing="$(fly secrets list -a "$APP" --json | grep -oE '"[Nn]ame": *"[^"]+"' | sed -E 's/.*"([^"]+)"$/\1/')"
  for name in $existing; do
    grep -q "^$name=" "$TMP" || OLD+=("$name")
  done
  if [ ${#OLD[@]} -gt 0 ]; then
    echo "Removing these old secrets from $APP:"
    printf '  %s\n' "${OLD[@]}"
  else
    echo "No old secrets to remove."
  fi
fi

read -r -p "Continue? [y/N] " answer
[ "$answer" = "y" ] || { echo "Nothing changed."; exit 0; }
# Removals are staged, then the import applies everything in one restart.
[ ${#OLD[@]} -eq 0 ] || fly secrets unset -a "$APP" --stage "${OLD[@]}"
fly secrets import -a "$APP" < "$TMP"
echo "Done. Check with: fly secrets list -a $APP"
