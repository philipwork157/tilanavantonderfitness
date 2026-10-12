# Tilana platform

This is the canonical shared guide for coding agents. Read it fully before
changing this repository.

## History and boundaries

The old admin/backend has been retired. The admin is `apps/admin-next`
(Next.js). The interim Nuxt admin (`apps/admin`) and its layer
(`packages/ui-nuxt`) were removed in October 2026; they remain in Git history
only. Build features only when the user requests them. Do not silently
restore the old feature scope.

`tilana-fitness-old/` contains the old admin, Drizzle/schema/migrations, email
package, tests, documentation, configuration and private environment files.
It is ignored by Git, Docker and pnpm and must never be installed, built,
deployed or migrated. Treat its documents as historical reference, not current
instructions.

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
  islands with Motion) and `styles/` (its own light and "espresso" dark
  tokens). Blog posts and kitchen recipes come live from the admin
  (`/api/public/blog-posts`, `/api/public/recipes`). Program slugs come
  from the admin (`beginner-volume-1`); see Programs below.
  Preserve its appearance, content, assets and public environment setup unless
  the user requests changes.
- `apps/admin-next`: the admin (port 3002): Next.js (App Router), shadcn/ui
  on Tailwind CSS v4, Motion, TanStack Query. It serves every API the website
  calls (the website's `PUBLIC_API_BASE_URL` points at it) and every screen:
  overview, inquiries, blog list and Markdown editor (Tiptap), newsletter
  subscribers and campaigns, kitchen recipes, programs, sales and website
  visitors. Brand
  theme in `src/app/globals.css` (light + `.dark` espresso). API routes keep the
  old admin's URLs and `{ statusCode, statusMessage }` error shape; screens call them
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
  never hex values or primitives. No app imports it directly today: the
  website has its own tokens in `apps/web/src/site/styles/base.css` and the
  admin in `apps/admin-next/src/app/globals.css`.
- `packages/content`: safe Markdown rendering (`renderMarkdown`) and reading
  time, shared by the website and admin.

The website calls the programs, checkout, contact, newsletter and blog
endpoints on its configured API origin (the admin). Do not substitute fake
successful payments, messages or email delivery. Deployed APIs are unaffected
until an explicit deployment.

## Development and security

Use the existing Next.js/Astro stack and workspace aliases. Keep shared types in
`@tilana/contracts`, backend rules in server services and HTTP validation/auth
in routes. If Drizzle is reintroduced, keep schema/migration ownership explicit.
Keep application IDs consistent; do not invent several competing identity models.

Actual integration credentials live only in each app's ignored `.env` or provider
secrets. The admin uses `apps/admin-next/.env.local` (also read by `pnpm db:*`)
and only the settings listed in `apps/admin-next/.env.example`. The website keeps
`apps/web/.env`; only `PUBLIC_*` values may reach browsers.
Never print, commit or expose secrets, tokens, magic links or private documents.
Maintain secret-free `.env.example` files containing only settings for implemented
features.

For payments, verify provider evidence on the server,
validate amount/currency/environment, enforce ownership, and make retries
idempotent. Never grant programs from a browser redirect or mark a paid order
failed merely because its email is delayed. Simplicity does not remove these
necessary safety boundaries.

## Testing and commands

- `pnpm dev`: all local applications (website and admin); `pnpm dev:stop` stops managed servers.
- `pnpm db:generate`: create a migration from schema changes; `pnpm db:migrate`:
  apply pending migrations to the database in `apps/admin-next/.env.local`; `pnpm db:add-admin --email ...`.
- `pnpm dev:web` / `pnpm dev:admin-next`: one application.
- `pnpm test`: tests in active workspaces (website and admin; admin database tests need `TEST_DATABASE_URL`).
- `pnpm test:coverage`: active test coverage.
- `pnpm check`: active lint/type checks.
- `pnpm build:web` / `pnpm build:admin-next` / `pnpm build`: production builds.

The old backend's tests stay archived in `tilana-fitness-old/`.
Write regression tests for newly implemented behavior. Use isolated databases
and simulated external providers when needed; tests must never send real
payments, emails or production writes. Run relevant tests, `pnpm check` and
affected builds before handoff. Report unimplemented/unverified behavior honestly.
Use `pnpm dev:stop` before replacing managed development processes.

## Deployment

GitHub Actions deploy both apps; see `docs/deploy.md`. A push to `dev` deploys
development; production is a manual run on `main` (type "deploy"). Order: quality
checks, admin (Fly.io from the root `Dockerfile`; migrations are run by hand,
not by the pipeline;
`fly.toml` / `fly.prod.toml`, Frankfurt), then the website (Cloudflare Worker
from `apps/web/dist/server`). Settings live in Fly secrets and GitHub
secrets/variables, never in the repository. Do not deploy, change secrets or
run migrations against a remote database without explicit authorization.

## Every screen (website and admin)

- Supports light and dark mode. The admin uses its theme tokens in
  `globals.css` (switching under `.dark`); the website uses its own tokens, switching under
  `[data-theme='dark']`. Check both themes before handoff.
- Works on mobile: usable from 360px wide, no horizontal page scroll, touch
  targets at least 44px on the website and 36px in the admin.
- Use semantic tokens, keep a visible focus ring and respect reduced motion.

## Email and public endpoints

- Email goes through Amazon SES (`apps/admin-next/src/server/utils/email.ts`). In
  development `EMAIL_DEV_REDIRECT_TO` is required and receives every
  outgoing email; production leaves it unset. Never send to real people from dev.
- Save first, then email: a failed email is recorded on the row, never lost.
- Website-facing endpoints are listed in `PUBLIC_WEBSITE_PATHS`
  (`server/utils/website-origins.ts`) and only accept `WEBSITE_ORIGINS`.
  `/api/contact` also requires Turnstile in production, a honeypot and a rate limit.

## Blog

- Posts live in `blog_posts`; the body is Markdown. Render it only with
  `renderMarkdown` from `@tilana/content` (raw HTML off, images off, safe links
  only). Never render post text with raw HTML any other way.
- Closing line and quote are separate fields; "With love, Tilana" and the
  "Please note" box are fixed in the website template, not stored per post.
- Cover photos (and Kitchen recipe photos) go to the public Cloudflare R2
  bucket (`R2_PUBLIC_BUCKET`, e.g. `tilanavantonder-dev-public`, served on
  `R2_PUBLIC_URL`) as `blog/<id>/<uuid>.webp` (`kitchen/<id>/...`), written
  only by the server (`server/utils/media-storage.ts`). The database stores
  paths, never addresses. Uploads are re-encoded to WebP with sharp (metadata
  stripped); SVG is rejected. Email copies are JPEGs under `email/`.
  `pnpm storage:move` moved everything from Supabase Storage (once per
  environment).
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
  email to `NEWSLETTER_TEST_TO` that is newer than the last edit, and only
  when the reviewed recipient count still matches. In development (redirect
  set) test emails go only to `EMAIL_DEV_REDIRECT_TO`.
- Sending runs in the background (`startCampaignRunner`): one
  `newsletter_deliveries` row per subscriber, claimed before sending, so nobody
  is emailed twice. Rate limits are retried; SES account problems pause the
  campaign (Resume in the admin). A restart resumes `sending` campaigns.
- SES bounces and complaints arrive through SNS at `POST /api/webhooks/ses`
  (signature and `SES_EVENTS_TOPIC_ARN` checked). Permanent bounces and
  complaints mark the subscriber `bounced`/`complained`; they are never emailed
  again unless they sign up and confirm again.
- Emails use a JPEG copy of the cover photo (`email/...jpg` in the bucket),
  because Outlook cannot show WebP.

## Programs

- Volumes hold programs: `volumes` (Volume 1, Volume 2, ...) → `programs`.
  Each program has its own website text, drawing, price and PDF. In the admin:
  Programs → a table of volumes (each with an on/off switch) → open a volume
  to add its programs → open a program to edit it.
- A program is on the website when its volume is switched on, its own
  switch is on (`programs.is_active`, on each card in the volume and in the
  editor; quick, with Undo) and it has a PDF. There is no separate publish
  step. New volumes start switched off; new programs start switched on.
  A volume with programs cannot be deleted.
- A program's slug is its public identity (`beginner-volume-1`): basket,
  checkout (`/api/public/program-volumes/<slug>`, the old catalogue URL and
  shape) and its anchor on `/program`. It is fixed while the program is on
  the website. Price changes and adding volumes or programs need the `admin` role.
- PDFs live in the private Cloudflare R2 bucket (`R2_PRIVATE_PROGRAM_BUCKET`,
  e.g. `tilanavantonder-dev-private`, one per environment), reached through the S3 API with two scoped tokens: upload
  (read & write) and download (read only). Server only, never a public URL.
  Uploads must start with `%PDF-` and end with `%%EOF`, max 15 MB; the SHA-256
  is stored. Keys are `programs/<id>/v<version>-<sha>.pdf` (older uploads
  `volumes/<id>/...`). Replacing a PDF bumps `file_version` and keeps the old file.
- "Peek inside" on `/program` is made from the PDF, never typed in: on upload
  (and by itself when the program page opens for an older PDF, or with "Make
  again") the admin draws the cover sharp plus about three inside pages
  blurred (`server/utils/pdf-preview.ts`: pdf.js + @napi-rs/canvas, sharp blur,
  640 px WebP) and stores them in the public R2 bucket under
  `program-previews/<id>/v<version>-<random>/` (`server/services/program-previews.ts`). `programs.preview`
  records which `file_version` they came from; the website only gets a peek
  made from the current PDF (`preview` in the public programs contract). Only
  these pictures are public; never upload unblurred inside pages. A failed peek
  never fails the PDF upload. Next to the pictures Tilana writes "What's
  inside" (`programs.highlights`, up to 4 lines of 90 characters, in the same
  admin panel, saved with the program); without lines the peek shows the
  summary and tags. On the website the peek is one component (`PeekView.tsx`)
  used by the "Take a peek inside" section (`PdfPeek.tsx`, a tab per program)
  and by the pop-up that "Peek inside the PDF" on each card opens
  (`PeekDialog.tsx`, any `data-peek="<slug>"` link; without JavaScript the
  link scrolls to the section). Add to basket in the pop-up closes it first.
- "Send me a test email" sends the real delivery email with the PDF attached to
  `NEWSLETTER_TEST_TO` (in development only `EMAIL_DEV_REDIRECT_TO`).
- The website reads the programs from `GET /api/public/programs`
  (`@tilana/contracts/public-programs`; no file details). `/` and `/program`
  are rendered on request with the same five-minute cached loader as the blog
  (`apps/web/src/utils/live-api.ts`) and show a "please try again" card if the
  API is down with no saved copy. The website looks the same whichever volume
  is on; each card's stamp shows its volume. Other pages load the programs in
  the browser only when the basket opens. The drawings and their animations
  stay in code (`ProgramArt.astro`); the admin picks one with `illustration`
  (barbell / breath / plate), `step` sets the barbell's plates and `tone` the
  colour. A new kind of drawing needs a new illustration value plus SVG in
  `ProgramArt.astro`. The quiz matches programs by step and drawing, not by name.
- Not built yet: a "resend my PDFs" form for buyers on the website (Tilana
  resends from Sales) and partial refunds.

## Payments (Paystack)

- Flow: the website posts the basket to `POST /api/checkout/paystack/basket`
  (honeypot and per-IP rate limit; no Turnstile, so buyers are never stopped
  before paying. Turnstile is only on the contact and newsletter forms). The admin re-checks every program is on
  the website and every price against the database (409 if changed), saves a
  `pending` order (`orders` + `order_items`, prices and names as sold) and
  returns Paystack's hosted payment page. A retry with the same
  `idempotencyKey` reuses the order; a finished one answers 409 with
  `data.reference` so the website shows its status instead of charging twice.
  If Paystack cannot start the payment the order is deleted (no money moved).
- An order becomes `paid` only after `transaction/verify` confirms status,
  reference, amount, currency ZAR and test/live mode. Two paths check:
  `GET /api/checkout/status?reference=` (the website's payment-complete page)
  and `POST /api/webhooks/paystack` (HMAC-SHA512 signature of the raw body with
  the secret key; then verified again). The conditional update to `paid`
  returns a row to exactly one caller, which emails the PDFs after the
  response (`afterResponse`) and records `delivery_status` sent/failed, then
  emails Tilana ("New sale", to `CONTACT_NOTIFY_TO`). Never mark an order paid
  from the browser redirect.
- Background order checks (`server/services/order-checks.ts`) every 5
  minutes in the admin server (`startOrderChecks`, from instrumentation), or
  via `GET /api/cron/order-checks` with `Authorization: Bearer $CRON_SECRET`
  on hosts without a long-running server. They re-verify unpaid orders with
  Paystack (a payment nobody confirmed becomes paid and is delivered; an order
  is only closed as abandoned/failed after Paystack says so and it is over an
  hour old, or Paystack has never heard of it after a day), retry PDF emails
  (10 min, 30 min, 2 h, 12 h after payment, then email Tilana) and follow up
  pending refunds. Tilana's "New sale" email is sent once (`sale_notified_at`).
- Fees: Paystack reports its fee per payment (`fees` on transaction/verify);
  it is saved as `orders.fee_cents` when the order is marked paid, and the
  order checks fill it in for orders without one. Sales shows sales, Paystack
  fees and "You receive" (sales minus fees), and the fee on each order. If the
  buyer pays the fee, Paystack charges more than requested: an order matches
  when Paystack's `requested_amount` equals the order total.
- A Paystack success that does not match the order (amount, currency, mode)
  is never marked paid: the order gets a `review_note` ("Needs review" on
  Sales, Tilana is emailed) until someone clicks "Mark as checked".
- Refunds: whole orders, admins only, from Sales ("Refund", with a reason) via
  Paystack `POST /refund`. The order stays paid with `refund_status` pending
  until Paystack confirms (`refund.processed` webhook or the order checks);
  then it is `refunded`, stops counting as a sale and the buyer gets an email.
  Refunds made in the Paystack dashboard are picked up from the webhook.
  `refund.failed` and `charge.dispute.create` set a review note and email
  Tilana. A refunded order can never become paid again.
- Programs that were ever sold cannot be deleted (resends need them); switch
  them off instead. Checkout refuses to start in production unless
  `WEBSITE_URL` is the public https address (Paystack sends buyers back there).
- Logs to follow one order: "Checkout started", "Paystack webhook received"
  (every signed event), "Order paid" (with `source`: payment page, webhook or
  order check), "Programs emailed", "Unpaid order closed", "Refund requested",
  "Order refunded" / "Refund failed". All carry the order number.
- Settings: `PAYSTACK_SECRET_KEY` and `PAYSTACK_MODE` (test/live); checkout
  refuses to start when the key prefix and mode disagree. Paystack cannot reach
  localhost, so in development the status check confirms payments; set the
  webhook URL in Paystack once the admin is online.
- Admin: Sales (`/sales`) shows paid sales per day and per program (Recharts
  via `components/ui/chart.tsx`), totals and the latest orders with their
  email status. Test-mode orders are marked "Test". Search finds any order by
  number, email or name (`GET /api/orders?q=`). "Email PDFs again" on a paid
  order (`POST /api/orders/<orderNumber>/resend`, max 5 per order per hour)
  sends the delivery email again to the buyer or to a corrected address (the
  order keeps the original address; no new sale email) and records the result.
- Overview shows today's paid sales and orders (South African day) and paid
  orders whose PDFs were not emailed.

## Next.js admin (apps/admin-next): standards

All admin work goes in `apps/admin-next`.

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
- **Logging**: use `logger` from `src/server/logger.ts` (pino), never
  `console`. `handle()` and the CORS wrappers log one line per request with a
  request ID (also sent back as `x-request-id`; the website sends its own
  `web-…` ID so both logs match), the masked IP and the signed-in admin. Never
  log request bodies, PDFs, tokens or full email addresses; pass errors as
  `{ err }`. Secret and personal field names are redacted automatically.
- **Destructive actions**: anything that deletes or removes data asks first
  with `ConfirmDialog` (`src/components/confirm-dialog.tsx`), naming the item
  and what happens to it.
- **Config**: read settings only through `src/server/config.ts` (plain names
  such as `DATABASE_URL`, never an app prefix); document every variable in
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
  (`requireAdmin`, `requireRole` in `apps/admin-next/src/server/auth/admin.ts`).

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
