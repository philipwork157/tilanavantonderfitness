# Tilana platform

This repository is a pnpm/Turborepo monorepo for Tilana van Tonder's public website and private administration portal.

## Stack and applications

- `apps/web`: Astro static public website at `https://tilanavantonder.co.za`. It owns public marketing pages and the contact form. Browser code must never receive database credentials or Supabase secret keys.
- `apps/admin`: Nuxt application and server API. Supabase cookie-based SSR authentication and the `user_roles` table protect its dashboard and admin APIs. It allows Tilana to sign in and review contact enquiries; client, program, and invoice management are the next phases. Public API endpoints live in `apps/admin/server/api`.
- `packages/contracts`: framework-neutral Zod request/response contracts and their inferred TypeScript types. Browser and server code may import this package.
- `packages/db`: server-only Drizzle schema, PostgreSQL client factory, and migration runner. Database migrations live in `supabase/migrations` and are generated and applied through the package's Drizzle scripts.
- `packages/email`: server-only, provider-neutral email transport with an AWS SES implementation. Nuxt services own message content; this package owns delivery.
- `packages/design-system`: shared design tokens and global visual language.
- `packages/ui-astro` and `packages/ui-nuxt`: framework-specific shared UI components.

## Security boundaries

- Supabase hosts PostgreSQL, Auth, and later private file storage. Drizzle owns application table definitions and migrations.
- Only Nuxt server routes and services may import `@tilana/db/server` or `@tilana/email/server`, or use database, Supabase service-role, Turnstile, and AWS credentials.
- Only variables explicitly prefixed with `PUBLIC_` (Astro) or placed under Nuxt `runtimeConfig.public` may reach a browser.
- Validate every API request, enforce origin checks, rate-limit public endpoints, and require Cloudflare Turnstile in production.
- Enable PostgreSQL row-level security on application tables. Do not add anonymous write policies; public writes go through the validated Nuxt API.
- Do not collect diagnoses, medical records, identity numbers, or other sensitive health information in the public contact form.
- Never commit `.env` files, credentials, generated output, or dependency/build directories.

## Working conventions

- Use TypeScript and keep shared data contracts close to their owning package.
- Use Nuxt server API routes for the backend; do not add a second API framework.
- Follow the backend flow `API route -> Zod contract -> service -> Drizzle`. Routes own HTTP and security checks; services own business rules and database mapping; `packages/db` owns tables and inferred row/insert types.
- Keep changes compatible with `pnpm lint`, `pnpm typecheck`, and `pnpm build`.
- Preserve the existing public-site design system, accessibility, responsive behaviour, and reduced-motion support.
