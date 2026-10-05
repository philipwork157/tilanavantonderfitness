# Tilana van Tonder platform

A pnpm/Turborepo workspace with the existing Astro public website, a clean Nuxt
admin starting point and shared Tilana design packages.

## Admin rebuild

The old backend and its tests are preserved locally in `tilana-fitness-old/`.
The new admin has Supabase password sign-in; access comes from the `users` and
`roles` tables in `packages/db` (Drizzle). Email, payments and business APIs are
not implemented yet.

See [the rebuild notes](docs/admin-rebuild.md) for archive contents, recovery
information and the next feature scope. No deployed service or remote database
was reset. The ignored archive is local reference material, not a GitHub backup.

## Active workspace

```text
apps/
  web/                 Existing Astro public website, unchanged
  admin/               Clean Nuxt starting point
packages/
  contracts/           Existing website-compatible API contracts
  design-system/       Shared brand tokens and CSS
  ui-astro/            Shared Astro components
  ui-nuxt/             Shared Nuxt layer and components
tilana-fitness-old/     Ignored old backend, tests and private configuration
tilana-content-work/    Ignored PDF/Word work, marketing exports and UI previews
```

## Local creative files and caches

Personal PDF/Word drafts, renders, reels and generated images live in
`tilana-content-work/`, not in the application folders. See its local `README.md`
for the retained folder layout and generator scripts. Git does not back up this
folder; keep a separate copy of important documents. Website assets remain in
`apps/web/src/assets` and `apps/web/public`.

`.turbo/cache`, old root `.cache`/`.astro`, root `dist` and `.pnpm-store` are
regenerable build/dependency caches, not creative documents. Keep installed
`node_modules` and active app caches while local servers are running. `.openai`
contains hosting configuration; it is not a disposable output folder.

## Local development

```sh
pnpm install
pnpm dev
```

The website uses `http://localhost:4321`; admin uses `http://localhost:3001`.
Use `pnpm dev:web` or `pnpm dev:admin` to run one application, and
`pnpm dev:stop` to stop managed development servers.

The local website's catalogue, enquiry/newsletter, checkout and customer access
features need the backend APIs to be rebuilt, or an explicitly selected existing
API origin. Do not mistake the clean admin page for a working backend.

## Environment files

Each app keeps its own ignored `.env`. The admin's `apps/admin/.env` holds only
the settings in `apps/admin/.env.example` (currently `NUXT_SUPABASE_URL`,
`NUXT_SUPABASE_PUBLISHABLE_KEY`, `NUXT_DATABASE_URL`); `pnpm db:*` commands read it
too. Older integration settings are archived in `tilana-fitness-old/apps/admin/.env`
and return one at a time as features are rebuilt. Keep real secrets out of Git.

The website retains `apps/web/.env` and `apps/web/.env.example`. Its public
settings remain separate from private backend configuration.

## Verification and deployment

```sh
pnpm test
pnpm check
pnpm build:web
pnpm build:admin
```

Existing website tests remain active. Old admin/database/browser tests and
migrations are archived. Public deployment remains available; admin Fly
deployment and scheduled legacy recovery are paused in this branch. Nothing
should deploy the starter over an existing working admin.

Keep brand decisions in the shared design system. Build the new admin a feature
at a time: login, programs/volumes/private PDFs, sales and a small dashboard.
