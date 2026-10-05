# Tilana platform

This is the canonical shared guide for coding agents. Read it fully before
changing this repository.

## Current rebuild state

The old admin/backend has been retired locally. `apps/admin` is a clean Nuxt
starter, not a working login, database, payment or customer portal. Rebuild
features only when the user requests them. Do not silently restore the old
feature scope.

`tilana-fitness-old/` contains the old admin, Drizzle/schema/migrations, email
package, tests, documentation, configuration and private environment files.
It is ignored by Git, Docker and pnpm and must never be installed, built,
deployed or migrated. Treat its documents as historical reference, not current
instructions. Read `docs/admin-rebuild.md` for the recovery point and boundaries.

No remote database, storage, deployed app or production data was reset. New
database work must use an explicitly isolated development database. Never apply
an archived migration or a new baseline to an existing database without a
separate reviewed migration plan.

## Active packages

- `apps/web`: existing Astro public website. Preserve its appearance, content,
  assets and public environment setup unless the user requests changes.
- `apps/admin`: fresh Nuxt admin starter. It extends `@tilana/ui-nuxt`.
- `packages/contracts`: website-facing Zod contracts. Legacy admin-only
  contracts are archived. Keep public API contracts compatible while rebuilding.
- `packages/design-system`: shared visual tokens and CSS.
- `packages/ui-astro`: shared Astro presentation components.
- `packages/ui-nuxt`: shared Nuxt layer and components.

The website still calls catalogue, checkout, contact, newsletter and customer
access endpoints on its configured API origin. The new local admin does not
implement them yet. Do not substitute fake successful payments, messages or
email delivery. Deployed APIs are unaffected until an explicit deployment.

## Development and security

Use the existing Nuxt/Astro stack and workspace aliases. Keep shared types in
`@tilana/contracts`, backend rules in server services and HTTP validation/auth
in routes. If Drizzle is reintroduced, keep schema/migration ownership explicit.
Keep application IDs consistent; do not invent several competing identity models.

Actual integration credentials live only in the ignored root `.env` or provider
secrets. Nuxt CLI scripts explicitly load `../../.env`. The starter does not
consume old integration credentials. The website keeps `apps/web/.env`; only
`PUBLIC_*` values or deliberately public Nuxt runtime config may reach browsers.
Never print, commit or expose secrets, tokens, magic links or private documents.
Maintain a secret-free `.env.example` containing only settings for implemented
features.

When payments/access are rebuilt, verify provider evidence on the server,
validate amount/currency/environment, enforce ownership, and make retries
idempotent. Never grant programs from a browser redirect or mark a paid order
failed merely because its email is delayed. Simplicity does not remove these
necessary safety boundaries.

## Testing and commands

- `pnpm dev`: both local applications; `pnpm dev:stop` stops managed servers.
- `pnpm dev:web` / `pnpm dev:admin`: one application.
- `pnpm test`: tests in active workspaces (currently the existing website tests).
- `pnpm test:coverage`: active test coverage.
- `pnpm check`: active lint/type checks.
- `pnpm build:web` / `pnpm build:admin` / `pnpm build`: production builds.

Old financial/integration/browser tests and database commands are archived.
Write regression tests for newly implemented behavior. Use isolated databases
and simulated external providers when needed; tests must never send real
payments, emails or production writes. Run relevant tests, `pnpm check` and
affected builds before handoff. Report unimplemented/unverified behavior honestly.
Use `pnpm dev:stop` before replacing managed development processes.

Admin deployment and legacy scheduled recovery are paused in this branch.
Do not restore them until a working backend is explicitly approved for rollout.
Keep public deployment functional. An ignored archive is not a remote backup.

## Editing and handoff

Keep modules focused and avoid unnecessary abstractions. Reuse the design system
and existing helpers where appropriate. Add concise comments explaining security
boundaries or non-obvious behavior. Preserve accessibility, responsive layouts,
themes and reduced-motion support. Avoid em dashes in user-facing website copy.

Preserve unrelated changes. Do not commit, push, deploy, reset databases or remove
remote resources without explicit authorization. After repository changes,
include a ready-to-copy Conventional Commit message:
`type(scope): concise imperative summary`. State what was changed, what was
verified, and any remaining limits.
