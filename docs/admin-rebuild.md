# Admin rebuild starting point

The old admin/backend has been retired locally so the next version can be built
with a smaller feature scope. No remote database, Supabase account, R2 document,
email, payment, GitHub setting or deployed service was changed.

## Recovery and reference

- Recovery commit: `91793a2`.
- Local recovery tag: `archive/admin-before-rebuild-2026-10-05`.
- Rebuild branch: `codex/admin-rebuild-start`.
- Local archive: `tilana-fitness-old/`. It is ignored by Git, Docker and pnpm.
- The archive contains the original admin, database/email packages, migrations
  with their metadata, tests, backend documentation and deployment configuration.
  Contracts and root workspace configuration are also snapshotted for context.
- Original generated/dependency state is retained under the archive's
  `.local-artifacts/`; do not run, install, deploy or migrate from the archive.
- This ignored folder is not uploaded to GitHub and is not a database backup.

The archive was verified byte-for-byte against the recovery point for all 425
tracked files in its scope. The original private admin/web environment files
were also checked for equality without printing their contents.

## Active workspace

The public website, its tests, design-system, Astro UI and Nuxt UI packages remain
unchanged. Only website-facing contracts remain active; unused admin, coaching,
invoicing, provider and upload contracts are archived. `apps/admin` is a blank
branded Nuxt starting page, with no business services, authentication, database,
migrations or payment integrations. Old admin/integration/browser tests are in
the archive; website unit tests still run normally.

The current local admin cannot serve the public website's catalogue, checkout,
contact, newsletter or customer-access APIs. Keep their existing paths and
contracts in mind when rebuilding. Existing deployed APIs continue to run until
you explicitly replace them. Never deploy this starter over the existing admin.

## Environment and deployment

The original backend environment is archived in `tilana-fitness-old/apps/admin/.env`.
The admin's own `apps/admin/.env` contains only settings for rebuilt features.
Keep `apps/web/.env` unchanged; only its `PUBLIC_*` settings may reach the browser.
The tracked `apps/admin/.env.example` grows only as approved features need settings.

Admin Fly deployment and legacy scheduled recovery are paused in this branch.
Public deployment stays available. No workflow was run or pushed by this reset.
The old Docker/Fly configurations and recovery workflow are available in the
archive. Restore deployment only after implementing and validating the new backend.

## Next implementation scope

Start with admin login, program families/volumes and private PDF editions, then
recorded sales and a small dashboard. Add the website-facing APIs and customer
delivery/access as separate validated steps. Do not bring back coaching,
invoicing or other optional features unless explicitly requested.

Use a fresh isolated development database when database work begins. Do not run
an archived migration or a new reset/baseline against an existing database.
Production data handling is a separate user-managed decision, not part of this
local code reset.

## Reset verification

Verified locally on 5 October 2026:

- Frozen dependency install passed without changing public/shared package versions.
- Removed 264 unreachable dependency snapshots and 261 unused package entries
  without altering any retained dependency versions or peer contexts. Framework
  dependencies may still include generic database adapters; there is no active
  application database package, schema or migration.
- Only the seven intended workspace projects are active; the archive is excluded.
- All 109 existing website unit tests passed.
- Lint and type checks passed for all active packages.
- Fresh admin and public website production builds passed.
- The built starter returned HTTP 200 with its expected content and local website
  link; retired login, contact and dashboard routes returned HTTP 404.
- No copied private credential values were found in the admin build output.
- Public website/design-system/UI source and the website environment file are
  unchanged; website-facing contract behavior is preserved.

The temporary preview was stopped. No push, workflow dispatch or deployment was
performed. These checks validate the clean starting point, not
the retired purchase, login or delivery features.

## Git recovery

The reset is recorded with the commit message
`chore(admin): archive legacy backend and prepare a clean rebuild` on
`codex/admin-rebuild-start`. That commit is the clean rebuild checkpoint.
The original complete backend remains in Git at `91793a2`, also named by the
local tag `archive/admin-before-rebuild-2026-10-05`.

To inspect the old version without discarding the rebuild history, start from a
clean working tree and create a separate branch at that tag:

```sh
git switch -c codex/restore-legacy-admin archive/admin-before-rebuild-2026-10-05
```

Git recovery restores tracked code only. The ignored archive/private environment
files and remote databases, documents or deployed applications are not part of
the commit or a code rollback. No history was reset or rewritten.
