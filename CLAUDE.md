# Tilana platform

This is the canonical shared guide for coding agents. Read it fully before
changing this repository.

## Current rebuild state

The old admin/backend has been retired locally. `apps/admin` is being rebuilt
feature by feature. Implemented so far: admin sign-in (Supabase Auth password
login, httpOnly cookies, access from the `users`/`roles`/`user_roles` tables,
`requireAdmin()`/`requireRole()` for every admin API route) and an empty admin
shell (Overview, Inquiries, Newsletter, Blog). There are no payments, emails or
customer portal yet. Rebuild
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

## Local creative work

Keep PDF/Word authoring, marketing images/reels, working renders and UI screenshots
in the ignored root `tilana-content-work/` folder. Its `output/` contains finished
deliverables, `tmp/` contains drafts/generators/render previews, `artifacts/` holds
social media exports and `Claude outputs/` holds UI screenshots. These are local
work, not app source or disposable caches, and need a separate backup.
Do not move or delete files under `apps/web/public`: they are part of the
website. Do not delete creative work when clearing caches.

## Active packages

- `apps/web`: Astro public website, built from the "Full site" mockup
  (`/Applications/development/Mockups`, route `/site/`). Everything for it lives
  in `apps/web/src/site/`: `config.ts` (nav, email, WhatsApp), `data.ts`
  (programs, prices, quiz, FAQ), `layouts/SiteLayout.astro` (SEO, theme,
  header/footer, basket drawer, WhatsApp), `components/` (Astro + React
  islands with Motion), `styles/` (its own light and "espresso" dark tokens)
  and `content/kitchen/` (one Markdown file per recipe). Program slugs are the
  catalogue slugs (`move-volume-1` = Beginner, `strong-volume-1` = Advanced).
  Preserve its appearance, content, assets and public environment setup unless
  the user requests changes.
- `apps/admin`: Nuxt admin (port 3001). It extends `@tilana/ui-nuxt`. The
  website's API calls still go here.
- `apps/admin-next`: the new admin, built side by side (port 3002): Next.js
  (App Router), shadcn/ui on Tailwind CSS v4, Motion, TanStack Query. It has
  every Nuxt API endpoint (same URLs and behaviour; point the website's
  PUBLIC_API_BASE_URL at it to switch) and every screen: overview, inquiries,
  blog list and Markdown editor (Tiptap, configured like the Nuxt editor so
  posts round-trip unchanged), newsletter subscribers and campaigns. Brand
  theme in `src/app/globals.css` (light + `.dark` espresso). API routes keep the
  Nuxt URLs and `{ statusCode, statusMessage }` error shape; screens call them
  with `api()` from `src/lib/api.ts` (no server actions). `src/proxy.ts`
  refreshes the session and redirects signed-out visitors; the dashboard layout
  and every API route still check `getAdmin()`/`requireAdmin()`. Settings in
  `apps/admin-next/.env.local` (see `.env.example`). shadcn components live in
  `src/components/ui`, copied from the shadcn registry and owned here; local
  changes to them are marked with a `Tilana:` comment.
  Next.js 16 changed conventions (e.g. `middleware` is now `proxy`, async
  `cookies()`): check `node_modules/next/dist/docs/` before writing Next-specific code.
- `packages/contracts`: Zod request/response contracts (website-facing plus
  `admin-auth`). Legacy admin-only contracts are archived. Keep public API
  contracts compatible while rebuilding. Use `program` in code identifiers;
  British "programme" is website copy only. Public slugs, storage keys and the
  `?programme=` query parameter must not change.
- `packages/design-system`: design tokens v2 (primitives, semantic tokens,
  dark theme under `.dark`, compact admin density under
  `[data-density='compact']`). Components use semantic tokens
  (`--color-text-primary`, `--color-surface`, `--space-4`, `--radius-md`...),
  never hex values or primitives. The admin uses these tokens; the website
  has its own in `apps/web/src/site/styles/base.css`. The design-system
  document targets Next.js/HeroUI; this repo maps the same tokens onto Nuxt UI
  in `packages/ui-nuxt/app/assets/css/main.css`.
- `packages/ui-nuxt`: shared Nuxt layer and components.
- `packages/content`: safe Markdown rendering (`renderMarkdown`) and reading
  time, shared by the website and admin.

The website still calls catalogue, checkout, contact, newsletter and customer
access endpoints on its configured API origin. The new local admin does not
implement them yet. Do not substitute fake successful payments, messages or
email delivery. Deployed APIs are unaffected until an explicit deployment.

## Development and security

Use the existing Nuxt/Astro stack and workspace aliases. Keep shared types in
`@tilana/contracts`, backend rules in server services and HTTP validation/auth
in routes. If Drizzle is reintroduced, keep schema/migration ownership explicit.
Keep application IDs consistent; do not invent several competing identity models.

Actual integration credentials live only in each app's ignored `.env` or provider
secrets. The admin uses `apps/admin/.env` (also read by `pnpm db:*`) and only the
settings listed in `apps/admin/.env.example`. The website keeps `apps/web/.env`; only
`PUBLIC_*` values or deliberately public Nuxt runtime config may reach browsers.
Never print, commit or expose secrets, tokens, magic links or private documents.
Maintain secret-free `.env.example` files containing only settings for implemented
features.

When payments/access are rebuilt, verify provider evidence on the server,
validate amount/currency/environment, enforce ownership, and make retries
idempotent. Never grant programs from a browser redirect or mark a paid order
failed merely because its email is delayed. Simplicity does not remove these
necessary safety boundaries.

## Testing and commands

- `pnpm dev`: all local applications (website, Nuxt admin, Next admin); `pnpm dev:stop` stops managed servers.
- `pnpm db:generate`: create a migration from schema changes; `pnpm db:migrate`:
  apply pending migrations to the database in `apps/admin/.env`; `pnpm db:add-admin --email ...`.
- `pnpm dev:web` / `pnpm dev:admin` / `pnpm dev:admin-next`: one application.
- `pnpm test`: tests in active workspaces (currently the existing website tests).
- `pnpm test:coverage`: active test coverage.
- `pnpm check`: active lint/type checks.
- `pnpm build:web` / `pnpm build:admin` / `pnpm build:admin-next` / `pnpm build`: production builds.

Old financial/integration/browser tests and database commands are archived.
Write regression tests for newly implemented behavior. Use isolated databases
and simulated external providers when needed; tests must never send real
payments, emails or production writes. Run relevant tests, `pnpm check` and
affected builds before handoff. Report unimplemented/unverified behavior honestly.
Use `pnpm dev:stop` before replacing managed development processes.

Admin deployment and legacy scheduled recovery are paused in this branch.
Do not restore them until a working backend is explicitly approved for rollout.
Keep public deployment functional. An ignored archive is not a remote backup.

## Every screen (website and admin)

- Supports light and dark mode. The admin uses the design-system tokens
  (switching under `.dark`); the website uses its own tokens, switching under
  `[data-theme='dark']`. Check both themes before handoff.
- Works on mobile: usable from 360px wide, no horizontal page scroll, touch
  targets at least 44px on the website and 36px in the admin.
- Use semantic tokens, keep a visible focus ring and respect reduced motion.

## Email and public endpoints

- Email goes through Amazon SES (`apps/admin/server/utils/email.ts`). In
  development `NUXT_EMAIL_DEV_REDIRECT_TO` is required and receives every
  outgoing email; production leaves it unset. Never send to real people from dev.
- Save first, then email: a failed email is recorded on the row, never lost.
- Website-facing endpoints are listed in `PUBLIC_WEBSITE_PATHS`
  (`server/utils/website-origins.ts`) and only accept `NUXT_WEBSITE_ORIGINS`.
  `/api/contact` also requires Turnstile in production, a honeypot and a rate limit.

## Blog

- Posts live in `blog_posts`; the body is Markdown. Render it only with
  `renderMarkdown` from `@tilana/content` (raw HTML off, images off, safe links
  only). Never render post text with raw HTML any other way.
- Closing line and quote are separate fields; "With love, Tilana" and the
  "Please note" box are fixed in the website template, not stored per post.
- Cover photos go to the public Supabase Storage bucket `blog-images`, written
  only by the server with `NUXT_SUPABASE_SERVICE_ROLE_KEY`. Uploads are
  re-encoded to WebP with sharp (metadata stripped); SVG is rejected.
- The website is a Cloudflare Worker (`apps/web/wrangler.jsonc`). Every page
  is prebuilt except `/blog`, `/blog/<slug>` and `/sitemap-blog.xml`
  (`prerender = false`), which read `/api/public/blog-posts` live through
  `getPublishedPosts` (`apps/web/src/utils/blog-posts.ts`). Posts are cached
  on Cloudflare for five minutes, with the last good copy served if the admin
  API is down. Publishing never needs a website rebuild.

## Newsletter

- Double opt-in: `POST /api/newsletter/subscribe` saves a `pending` subscriber
  and emails a link to the website's `/newsletter/confirmed?token=...`, which
  POSTs `/api/newsletter/confirm` (so email link scanners cannot confirm).
  Only the SHA-256 of confirmation tokens is stored.
- Every newsletter has a personal unsubscribe link (`unsubscribe_token`) and a
  `List-Unsubscribe` header.
- A campaign shares one published blog post. It can only be sent after a test
  email to `NUXT_NEWSLETTER_TEST_TO` that is newer than the last edit, and only
  when the reviewed recipient count still matches. In development (redirect
  set) test emails go only to `NUXT_EMAIL_DEV_REDIRECT_TO`.
- Sending runs in the background (`startCampaignRunner`): one
  `newsletter_deliveries` row per subscriber, claimed before sending, so nobody
  is emailed twice. Rate limits are retried; SES account problems pause the
  campaign (Resume in the admin). A restart resumes `sending` campaigns.
- SES bounces and complaints arrive through SNS at `POST /api/webhooks/ses`
  (signature and `NUXT_SES_EVENTS_TOPIC_ARN` checked). Permanent bounces and
  complaints mark the subscriber `bounced`/`complained`; they are never emailed
  again unless they sign up and confirm again.
- Emails use a JPEG copy of the cover photo (`email/...jpg` in the bucket),
  because Outlook cannot show WebP.

## Programs

- `programs` holds what the website shows (name, headline, summary, description,
  tags, tone, illustration, strength series step or focus program).
  `program_volumes` is what people buy: price, "for sale" switch and the current PDF.
  Public slugs: program `move`, volume `move-volume-1`; volume slugs follow the
  program slug and are fixed once a program has been published.
- PDFs live in a private Cloudflare R2 bucket (`R2_PRIVATE_PROGRAM_BUCKET`, one per
  environment), reached through the S3 API with two scoped tokens: upload
  (read & write) and download (read only). Server only, never a public URL. Uploads must start with `%PDF-` and end
  with `%%EOF`, max 15 MB; the SHA-256 is stored. Replacing a PDF bumps
  `file_version` and keeps the old file.
- A volume can only be for sale with a PDF; a program can only be published
  with a headline, summary, description and a volume for sale. Price changes
  need the `admin` role.
- "Send me a test email" sends the real delivery email with the PDF attached to
  `NEWSLETTER_TEST_TO` (in development only `EMAIL_DEV_REDIRECT_TO`).
- Not built yet: the website reading programs from the API, checkout/Paystack,
  orders, the delivery runner and the resend form.

## Admin UI

- Built on Nuxt UI dashboard components (`UDashboardGroup`, `UDashboardSidebar`,
  `UDashboardPanel`, `UDashboardNavbar`) styled by the design tokens.
- Every admin page wraps its content in `<AdminPage id title>` (navbar with the
  sidebar collapse button and theme toggle). Sidebar items live in
  `apps/admin/app/utils/admin-navigation.ts`; the account menu (email, log out)
  is `AdminUserMenu`.
- Pages use the full width. Statuses use `AdminStatusBadge` with a tone from
  `app/utils/status-tones.ts`; coloured icons use `AdminIconChip`; list pages
  have an `AdminRefreshButton`.

## Next.js admin (apps/admin-next): standards

The Nuxt admin is being ported here; new admin work goes in `apps/admin-next`.

- **Checks must pass before handing over**: `pnpm --filter @tilana/admin-next lint`
  (zero warnings), `typecheck`, `test` and `build`. Also open the changed screens
  under `next dev` and confirm the browser console has no errors or warnings
  (React only reports hydration and nesting problems in dev).
- **Layout**: `src/app` routes and pages; `src/components` (shared UI,
  `components/ui` = shadcn primitives); `src/lib` (browser-safe helpers);
  `src/server` (server-only code: `config`, `db`, `services`, `utils`).
  Server modules start with `import 'server-only'`.
- **Server vs client**: pages and layouts are Server Components by default; add
  `'use client'` only to the smallest interactive part. Never import `src/server`
  from client code. Never put secrets in `NEXT_PUBLIC_*` variables.
- **Data**: screens read and write through the API routes with `api()` and
  TanStack Query (query keys per resource, invalidate after mutations). No
  server actions and no Next data caching (`fetch` cache, `unstable_cache`,
  `revalidate*`); admin data is always fresh. Dynamic pages set
  `export const dynamic = 'force-dynamic'`.
- **API routes**: one `route.ts` per URL, wrapped in `handle()`. Validate input
  with the zod contracts in `@tilana/contracts`; errors are `HttpError` and
  reach the client as `{ statusCode, statusMessage }`. Admin routes call
  `requireAdmin()`/`requireRole()` first; state-changing routes also call
  `sameOriginOnly()`. Public website routes use the CORS helper and keep their
  URLs and response shapes unchanged.
- **Config**: read settings only through `src/server/config.ts` (plain names
  such as `DATABASE_URL`, no `NUXT_` prefix); document every variable in
  `.env.example`.
- **UI**: build from shadcn components and the theme tokens in `globals.css`
  (`bg-card`, `text-muted-foreground`, `bg-tone-sage`...), never raw hex in
  components. Light and dark, mobile first, keyboard and screen-reader
  friendly; Motion for animation, always respecting reduced motion. HTML must
  nest validly (no block elements inside `<p>`).
- **Navigation feedback**: a click must always show something. Internal links
  use `NavLink` (`src/components/nav-link.tsx`), never `next/link` directly;
  code navigation uses `useNavigate()` from `src/lib/navigation-progress.ts`,
  never a bare `router.push`. Both start the top progress bar. Every dashboard
  route gets a `loading.tsx` built from `PageSkeleton`.
- **Code style**: TypeScript strict, no `any`, no unused code, small focused
  modules, comments only for non-obvious behaviour and security boundaries.
  Pin exact dependency versions and respect pnpm's minimum release age (do not
  add `minimumReleaseAgeExclude`).
- **Package manager**: pnpm only, from the repo root. Add packages with
  `pnpm --filter <app> add <pkg>@<exact version>`, run one-off tools with
  `pnpm dlx` (e.g. `pnpm dlx shadcn@<version> add table`). Never use npm,
  npx, yarn or bun, and never commit their lockfiles.

## Database

- `packages/db` owns the Drizzle schema and the single migration history
  (`packages/db/migrations`). Generate with `pnpm --filter @tilana/db db:generate`;
  apply with `db:migrate` against the development database only.
- IDs are auto-increment `bigint` identities. Public references (order numbers)
  get their own column instead of exposing IDs.
- Row level security is enabled on every table with no policies; only the
  server's connection string can read or write.
- `users` holds everyone who signs in; roles come from `roles` + `user_roles`
  (a user may hold several). Admin-area access: `admin` or `staff`
  (`requireAdmin`, `requireRole` in `apps/admin/server/utils/supabase.ts`).

## Editing and handoff

Keep modules focused and avoid unnecessary abstractions. Reuse the design system
and existing helpers where appropriate. Add concise comments explaining security
boundaries or non-obvious behavior. Preserve accessibility, responsive layouts,
themes and reduced-motion support.

Never use em dashes (—) anywhere on the website: copy, data, labels, alt text,
meta descriptions or code comments in `apps/web`. Use a comma, colon, full stop
or brackets instead. En dashes in number ranges (1–3 days) are fine.

Preserve unrelated changes. Do not commit, push, deploy, reset databases or remove
remote resources without explicit authorization. After repository changes,
include a ready-to-copy Conventional Commit message:
`type(scope): concise imperative summary`. State what was changed, what was
verified, and any remaining limits.
