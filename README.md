# Tilana van Tonder platform

A pnpm/Turborepo workspace with the Astro public website and the Next.js admin
that serves its APIs (programs, checkout with Paystack, contact, newsletter and
blog). Read `CLAUDE.md` for the full guide.

## Workspace

```text
apps/
  web/                 Astro public website (programs, checkout, live blog, kitchen)
  admin-next/          Next.js admin and the website's API
packages/
  contracts/           Website-compatible API contracts (zod)
  content/             Safe Markdown rendering shared by web and admin
  db/                  Drizzle schema and migrations
  design-system/       Brand design tokens
tilana-fitness-old/     Ignored old backend, tests and private configuration
tilana-content-work/    Ignored PDF/Word work, marketing exports and UI previews
```

The interim Nuxt admin (`apps/admin`, `packages/ui-nuxt`) was removed in
October 2026; it is in Git history. See [the rebuild notes](docs/admin-rebuild.md)
for the original reset and recovery point.

## Local creative files and caches

Personal PDF/Word drafts, renders, reels and generated images live in
`tilana-content-work/`, not in the application folders. Git does not back up this
folder; keep a separate copy of important documents. Website images live in
`apps/web/public`.

`.turbo/cache`, `.next`, `.astro`, `dist` and `.pnpm-store` are regenerable
build/dependency caches, not creative documents.

## Local development

```sh
pnpm install
pnpm --filter @tilana/db db:migrate
pnpm dev
```

The website runs on `http://localhost:4321` and the admin on
`http://localhost:3002`. Use `pnpm dev:web` or `pnpm dev:admin-next` to run one
application, and `pnpm dev:stop` to stop managed development servers.

## Environment files

Each app keeps its own ignored settings file. The admin's
`apps/admin-next/.env.local` holds the settings listed in
`apps/admin-next/.env.example`; `pnpm db:*` commands read `DATABASE_URL` from it
too. The website keeps `apps/web/.env` (see `apps/web/.env.example`); only
`PUBLIC_*` values reach browsers. Keep real secrets out of Git.

## Verification

```sh
pnpm test
pnpm check
pnpm build:web
pnpm build:admin-next
```

Admin database tests need a throwaway Postgres in `TEST_DATABASE_URL`.
