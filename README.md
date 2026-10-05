# Tilana van Tonder platform

A pnpm/Turborepo workspace with the existing Astro public website, a clean Nuxt
admin starting point and shared Tilana design packages.

## Admin rebuild

The old backend and its tests are preserved locally in `tilana-fitness-old/`.
The new admin has Supabase password sign-in restricted to the emails in
`NUXT_ADMIN_EMAILS`. Database, email, payments and business APIs are not
implemented yet.

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
```

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

The original backend environment is copied to the ignored root `.env`, kept
private and explicitly loaded by Nuxt commands. None of the old integration
credentials are consumed by the admin except those listed in `.env.example`,
which documents settings as each feature is implemented (currently admin sign-in:
`NUXT_SUPABASE_URL`, `NUXT_SUPABASE_PUBLISHABLE_KEY`, `NUXT_ADMIN_EMAILS`). Keep real secrets out of Git.

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
