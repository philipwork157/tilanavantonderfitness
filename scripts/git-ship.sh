#!/usr/bin/env bash
# git ship: push dev, merge dev into main, push main, then back to dev.
#
#   Set up once per computer:  git config alias.ship '!bash scripts/git-ship.sh'
#   Then, from the repo:       git ship
#
# Pushing dev deploys the development site and admin (GitHub Actions).
# Pushing main only runs the quality checks: production is still deployed by
# hand (Actions > Deploy production > type "deploy").
#
# It stops at the first problem and leaves you on dev, nothing half-done:
# uncommitted changes, a merge or rebase in progress, a conflict, or a push
# that GitHub refuses.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

DEV=dev
MAIN=main

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
step() { printf '\n\033[1m> %s\033[0m\n' "$*"; }
stop() { red "Stopped: $*"; exit 1; }

# Whatever happens, try to end on dev.
back_to_dev() {
  local status=$?
  if [ "$(git branch --show-current)" != "$DEV" ] && [ -z "$(git status --porcelain --untracked-files=no)" ]; then
    git checkout -q "$DEV" || true
  fi
  [ $status -eq 0 ] || red "You are on: $(git branch --show-current)"
}
trap back_to_dev EXIT

step "Checking the repo"
git_dir=$(git rev-parse --git-dir)
for marker in MERGE_HEAD rebase-merge rebase-apply CHERRY_PICK_HEAD; do
  [ ! -e "$git_dir/$marker" ] || stop "a merge, rebase or cherry-pick is still in progress. Finish or abort it first."
done
[ -z "$(git status --porcelain --untracked-files=no)" ] \
  || { git status --short --untracked-files=no; stop "you have uncommitted changes. Commit or stash them first."; }

git fetch origin --prune

step "Updating and pushing $DEV"
git checkout -q "$DEV"
if ! git merge-base --is-ancestor "origin/$DEV" "$DEV"; then
  echo "GitHub has $DEV commits you do not have yet; bringing them in first."
  git pull --rebase origin "$DEV" || { git rebase --abort 2>/dev/null || true; stop "your $DEV commits conflict with GitHub's. Run 'git pull --rebase', fix the conflicts, then git ship again."; }
fi
git push origin "$DEV" || stop "GitHub refused the $DEV push."

step "Merging $DEV into $MAIN"
git checkout -q "$MAIN" 2>/dev/null || git checkout -q -b "$MAIN" "origin/$MAIN"
git merge -q --ff-only "origin/$MAIN" || stop "your local $MAIN has commits that are not on GitHub. Sort out $MAIN by hand first."
if ! git merge --no-edit "$DEV"; then
  git merge --abort
  stop "$DEV and $MAIN conflict. Nothing was merged; resolve it by hand."
fi

step "Pushing $MAIN"
git push origin "$MAIN" || stop "GitHub refused the $MAIN push."

step "Back to $DEV"
git checkout -q "$DEV"
git pull --ff-only origin "$DEV"

green "
Shipped: $DEV and $MAIN are both on GitHub, and you are back on $DEV.
Production is not deployed yet: run 'Deploy production' in GitHub Actions when ready."
