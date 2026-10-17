#!/usr/bin/env bash
# Syncs the LIVE admin's settings on Fly.io (tilanavantonder-admin-prod) with
# apps/admin-next/.env.prod, without wiping anything by accident.
#
#   bash scripts/fly-prod-secrets.sh              shows the plan, asks, then applies it
#   bash scripts/fly-prod-secrets.sh --dry-run    only shows the plan
#   bash scripts/fly-prod-secrets.sh --keep-old   never removes anything from Fly
#
# The plan, by name (values are never printed):
#   + add      in .env.prod with a value, not on Fly yet
#   ~ set      in .env.prod with a value and on Fly: set to the .env.prod value
#              (Fly only shows a fingerprint, so unchanged values are set again; harmless)
#   = keep     empty in .env.prod but on Fly: left as it is on Fly (so an empty
#              line, e.g. PAYSTACK_SECRET_KEY before you paste it, never deletes a live key)
#   - remove   on Fly, not in .env.prod at all (old or renamed settings)
#
# Renaming a setting: rename it in .env.prod. The plan shows the new name as
# "+ add" and the old one as "- remove". Everything is applied in one restart.
# Run from the repo root.
set -euo pipefail

APP="tilanavantonder-admin-prod"
ENV_FILE="apps/admin-next/.env.prod"
DRY_RUN=0
KEEP_OLD=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --keep-old) KEEP_OLD=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

cd "$(dirname "$0")/.."
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE" >&2; exit 1; }
command -v fly >/dev/null || { echo "Install flyctl first: brew install flyctl" >&2; exit 1; }
fly auth whoami >/dev/null 2>&1 || { echo "Sign in first: fly auth login" >&2; exit 1; }

# Settings that belong to the container, never to the file.
SKIP_NAMES=" NODE_ENV PORT HOSTNAME "

value() { grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }

# ── Live-site safety: the wrong file must never reach production ──
[ "$(value WEBSITE_URL)" = "https://tilanavantonder.co.za" ] || { echo "Refusing: WEBSITE_URL in $ENV_FILE must be https://tilanavantonder.co.za." >&2; exit 1; }
[ "$(value PAYSTACK_MODE)" = "live" ] || { echo "Refusing: PAYSTACK_MODE must be live for production." >&2; exit 1; }
case "$(value PAYSTACK_SECRET_KEY)" in ''|sk_live_*) ;; *) echo "Refusing: PAYSTACK_SECRET_KEY must be a sk_live_ key (or empty for now)." >&2; exit 1 ;; esac
[ -z "$(value EMAIL_DEV_REDIRECT_TO)" ] || { echo "Refusing: EMAIL_DEV_REDIRECT_TO must be empty on live, or no customer gets their email." >&2; exit 1; }
case "$(value R2_PRIVATE_PROGRAM_BUCKET) $(value R2_PUBLIC_BUCKET)" in *dev*) echo "Refusing: the R2 buckets in $ENV_FILE are development buckets." >&2; exit 1 ;; esac
if [ -f apps/admin-next/.env.local ] && [ "$(value DATABASE_URL)" = "$(grep -E '^DATABASE_URL=' apps/admin-next/.env.local | tail -n1 | cut -d= -f2-)" ]; then
  echo "Refusing: $ENV_FILE has the same DATABASE_URL as .env.local." >&2; exit 1
fi

# ── What the file wants ──
WANT_SET=()    # names with a value
WANT_EMPTY=()  # names present but empty
while IFS= read -r line; do
  [[ "$line" =~ ^([A-Z_][A-Z0-9_]*)= ]] || continue
  name="${BASH_REMATCH[1]}"
  [[ "$SKIP_NAMES" == *" $name "* ]] && continue
  [[ " ${WANT_SET[*]-} ${WANT_EMPTY[*]-} " == *" $name "* ]] && continue
  if [ -n "$(value "$name")" ]; then WANT_SET+=("$name"); else WANT_EMPTY+=("$name"); fi
done < "$ENV_FILE"
[ ${#WANT_SET[@]} -ge 10 ] || { echo "Refusing: $ENV_FILE has only ${#WANT_SET[@]} settings with a value. Is it the right file?" >&2; exit 1; }

# ── What Fly has (names only; Fly never returns values) ──
ON_FLY=()
while IFS= read -r name; do [ -n "$name" ] && ON_FLY+=("$name"); done < <(
  fly secrets list -a "$APP" --json | grep -oE '"[Nn]ame": *"[^"]+"' | sed -E 's/.*"([^"]+)"$/\1/' | sort -u
)
on_fly() { [[ " ${ON_FLY[*]-} " == *" $1 "* ]]; }
in_file() { [[ " ${WANT_SET[*]-} ${WANT_EMPTY[*]-} " == *" $1 "* ]]; }

ADD=(); UPDATE=(); KEEP=(); REMOVE=(); MISSING=()
for name in "${WANT_SET[@]}"; do if on_fly "$name"; then UPDATE+=("$name"); else ADD+=("$name"); fi; done
for name in "${WANT_EMPTY[@]-}"; do
  [ -n "$name" ] || continue
  if on_fly "$name"; then KEEP+=("$name"); else MISSING+=("$name"); fi
done
for name in "${ON_FLY[@]-}"; do
  [ -n "$name" ] || continue
  in_file "$name" && continue
  [[ "$SKIP_NAMES" == *" $name "* ]] && continue
  REMOVE+=("$name")
done
[ "$KEEP_OLD" = 0 ] || REMOVE=()

# ── The plan ──
# macOS bash 3.2 turns an empty array into one empty word, so empty names are skipped here.
show() {
  local mark="$1" label="$2" names=() name
  shift 2
  for name in "$@"; do [ -n "$name" ] && names+=("$name"); done
  [ ${#names[@]} -gt 0 ] || return 0
  echo "$label"
  printf "  $mark %s\n" "${names[@]}"
}
echo "Fly app: $APP   file: $ENV_FILE   (values hidden)"
echo
show "+" "Add (new on Fly):" "${ADD[@]-}"
show "~" "Set (already on Fly, set to the file's value):" "${UPDATE[@]-}"
show "=" "Keep on Fly (empty in the file, so left alone):" "${KEEP[@]-}"
show "-" "Remove from Fly (not in the file any more):" "${REMOVE[@]-}"
show " " "Empty in the file and not on Fly (nothing to do):" "${MISSING[@]-}"
[ "$KEEP_OLD" = 0 ] || echo "(--keep-old: nothing is removed)"
echo

if [ "$DRY_RUN" = 1 ]; then echo "Dry run: nothing changed."; exit 0; fi
read -r -p "Apply this to the LIVE admin? It restarts once (no downtime). Type 'live' to continue: " answer
[ "$answer" = "live" ] || { echo "Nothing changed."; exit 0; }

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
chmod 600 "$TMP"
for name in "${WANT_SET[@]}"; do printf '%s=%s\n' "$name" "$(value "$name")" >> "$TMP"; done

# Stage everything, then one deploy: a single restart with the whole new set.
[ ${#REMOVE[@]} -eq 0 ] || fly secrets unset -a "$APP" --stage "${REMOVE[@]}"
fly secrets import -a "$APP" --stage < "$TMP"
fly secrets deploy -a "$APP"
echo "Done. Check with: fly secrets list -a $APP"
