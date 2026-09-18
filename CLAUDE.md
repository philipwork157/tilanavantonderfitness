# Tilana platform

This is the canonical project guide for every coding agent working in this
repository. Read it completely before inspecting, planning, or changing code.

The repository is a pnpm/Turborepo monorepo for Tilana van Tonder's public
website, administration portal, customer program portal, and supporting server
APIs.

## Applications and packages

- `apps/web`: Astro public website deployed to Cloudflare Pages. It owns the
  marketing pages, program purchase forms, checkout completion UI, contact
  form, newsletter forms, and links into the customer portal. It is static and
  must never receive database credentials or secret keys.
- `apps/admin`: Nuxt application deployed as a server application. It contains
  the admin dashboard, client and coaching tools, newsletter management,
  customer program portal, and all trusted server API routes. Public website
  requests such as checkout and contact submission also terminate here.
- `packages/contracts`: framework-neutral Zod request and response contracts
  with inferred TypeScript types. Both browser and server code may import it.
- `packages/db`: server-only Drizzle PostgreSQL schema, database client, schema
  checks, and migration commands.
- `packages/email`: server-only email transport. Nuxt services create message
  content and this package delivers it through AWS SES.
- `packages/design-system`: shared design tokens and visual language.
- `packages/ui-astro` and `packages/ui-nuxt`: framework-specific shared UI.
- `supabase/migrations`: committed PostgreSQL migrations and Drizzle metadata.

Use the configured application aliases instead of parent-directory import
chains: `@app/*` maps to `apps/admin/app/*`, `@server/*` maps to
`apps/admin/server/*`, and `@web/*` maps to `apps/web/src/*`. Continue using the
workspace package names (`@tilana/*`) for shared packages. Relative `./` imports
are appropriate for files in the same directory.

Use the backend structure `API route -> Zod contract -> service -> Drizzle`:

- API routes own HTTP parsing, authentication/authorization, origin checks,
  response codes, and safe public error messages.
- Contracts own validation shared across the browser/server boundary.
- Services own business rules, transactions, and provider integrations.
- `packages/db` owns tables, relationships, constraints, and inferred types.

Do not introduce another API framework or let page components query PostgreSQL
directly.

## Code and testing conventions

- Write or update Vitest tests for every new or changed function and API
  behavior in the same task. Cover successful results, invalid input, edge
  cases, and failures. API tests must also cover applicable authentication,
  authorization, ownership, origin checks, and response codes. Add a regression
  test for every bug fix.
- Test business rules and contracts directly. Add integration tests when
  correctness depends on route wiring, database constraints, transactions, or
  provider lifecycles; mocked unit tests alone do not prove those boundaries.
  Keep tests deterministic, reset mocks and environment changes between tests,
  and never send real payments, emails, or production writes from a test.
  Run `pnpm test` before handing off code changes and use `pnpm test:coverage`
  when checking coverage. Report any unverified behavior honestly.
- Use the application aliases documented above in code and tests. Keep alias
  configuration aligned across the framework, TypeScript, and Vitest. Import
  shared domain constants and types from framework-neutral contracts rather
  than repeating string literals or importing server-only database packages
  into browser code. User roles come from `@tilana/contracts/identity`, using
  `USER_ROLES.ADMIN`, `USER_ROLES.CUSTOMER`, and `USER_ROLES.STAFF`.
- Before adding a helper or component, look for an existing reusable one.
  Extract functions that will be reused into focused, appropriately scoped
  utilities. Keep business rules in services, validation in contracts, and
  reactive UI behavior in composables. Do not turn utilities into a catch-all
  or create abstractions with no genuine reuse.
- Keep files small, readable, and focused on one responsibility. Split large
  pages, components, API handlers, and services into cohesive modules. Reuse
  shared UI components and helpers instead of copying implementations, while
  keeping API routes thin and preserving the architecture above.
- Add concise purpose comments or docblocks as you write new functions, API
  handlers, components, and shared modules. Explain the flow, non-obvious
  decisions, security boundaries, invariants, and side effects where relevant.
  Keep comments accurate when behavior changes; explain intent rather than
  narrating every obvious line of syntax.

## Database identity rules

Every application-owned table has an auto-incrementing PostgreSQL integer `id`
primary key. All application foreign keys use those integer IDs.

The only UUID retained by the application schema is `users.supabase_id`, which
uniquely references `auth.users.id`. Never use a Supabase UUID as an application
primary key or as a foreign key in another application table.

The identity chain is:

```text
Supabase auth.users.id (UUID)
  -> users.supabase_id (UUID bridge)
  -> users.id (integer application identity)
  -> user_roles.user_id / clients.user_id (integer relationships)
```

Important ownership relationships are:

```text
clients.id
  -> orders.client_id
     -> order_items.order_id
     -> payments.order_id
        -> payment_events.payment_id
        -> payment_refunds.payment_id

programs.id
  -> program_volumes.program_id
     -> program_files.program_volume_id
     -> order_items.program_volume_id
     -> program_access.program_volume_id

clients.id
  -> program_access.client_id
  -> client_health_profiles.client_id
  -> client_checkins.client_id
     -> client_checkin_photos.checkin_id
     -> client_nutrition_targets.checkin_id
```

Composite constraints deliberately prevent cross-client corruption:

- An `order_item` carries `order_id` and `client_id`, and both must identify the
  same order/client pair.
- Purchase-based `program_access` must match the order item's client and program
  volume.
- A nutrition target's `checkin_id` and `client_id` must match the same check-in.
- A refund's `payment_id`, provider, and currency must match its payment.

Do not remove these duplicated ownership columns; they are integrity guards.
All application tables have RLS enabled. The privileged Nuxt connection bypasses
RLS, so server routes must still enforce role, ownership, and entitlement rules.

See `docs/database-design.md` for the detailed domain model.

## Money and order history

- Store every amount as an integer number of cents. For example, R400 is
  `40000`. Never store financial amounts as floating-point numbers.
- `program_volumes.current_price_cents` is the current catalogue price.
- `order_items` snapshots the purchased description, unit price, quantity, and
  line total. Historical purchases must not change when catalogue prices change.
- `orders` owns the commercial total and customer snapshot.
- `payments` represents individual attempts. One order may have more than one
  payment attempt.
- Provider references and IDs are external text identifiers; internal links
  still use integer database IDs.

## Paystack checkout flow

Customers do not need to create an account before buying a program. The flow is:

1. The public website sends one to ten unique database volume slugs, displayed-price
   snapshots, and guest contact details to the Nuxt basket checkout API. The legacy
   direct checkout endpoint remains available for a single volume.
2. The server validates every requested volume and reads all authoritative prices
   from `program_volumes`; it never trusts browser-supplied prices or totals.
3. Both checkout contracts require an unpredictable `idempotencyKey`. The
   browser persists one key per normalized customer/basket fingerprint and
   reuses it across retries/reloads. A transaction serializes the key and
   reuses its pending order/payment, rejecting changed details under that key.
   A new reservation creates or reuses the case-insensitive `clients` record and
   inserts an integer-linked pending `order`, one immutable `order_item` per
   programme, and a payment for the server-calculated total.
4. A persisted atomic claim allows one bounded Paystack initialization call.
   The server returns the saved hosted URL/reference on duplicate requests;
   settled attempts return to their existing confirmation screen. Timeouts or
   malformed responses remain uncertain under the same reference and are
   reconciled by verification/webhooks, never replaced automatically with a
   new payable order. See `docs/checkout-idempotency.md` for recovery/rollout.
5. The Paystack callback only controls the customer-facing completion screen.
   It is not proof of payment.
6. A signed Paystack webhook, or the server verification fallback, must confirm
   the exact reference, environment, successful status, amount, and currency.
7. Successful confirmation atomically marks the payment/order paid and grants
   `program_access` for the purchased order items.

`payment_events` is the immutable webhook audit/idempotency ledger. Provider
event keys must make repeated webhook delivery a safe no-op. Never grant access
from a browser redirect alone.

Paystack secrets are server-only runtime configuration. Test payments must use
the test key/environment and live payments must use the live key/environment.
Never allow an environment to refund a payment created in the other environment.
The backend validates secret-key prefixes before provider operations and validates
checkout/account URLs (HTTPS for deployed builds; callback origin must match
`public.siteUrl`). Paystack databases must contain only one provider environment:
checkout, verification, webhook/refund processing, magic-link eligibility,
account linking, and existing customer sessions fail closed when another mode
or an unknown mode is present. This deliberately quarantines legacy test access
instead of promoting it to live. Use separate production Supabase/database/private
storage resources; retain test history in the test database, never relabel it.
The known Fly dev/prod apps additionally require test/live mode respectively;
production payments/customer access stay unavailable under the pre-launch test
configuration. Test purchases must never unlock production private storage.
First checkout reservations take a database advisory lock and recheck isolation
inside the transaction so differently configured apps cannot race into an empty
database. Manual payments do not participate in this Paystack-mode check.

## Paystack refund flow

The client list exposes the refund action only for a refundable Paystack payment
in the currently configured environment. It supports full and partial refunds.

1. The admin UI validates the amount in rands and sends integer cents to
   `POST /api/admin/orders/:id/refund`.
2. The route requires an administrator session, enforces same-origin requests,
   validates the integer order ID, and validates the body with
   `@tilana/contracts/payments`.
3. The service locks the payment, confirms it is eligible, prevents a second
   unsettled refund, calculates the remaining amount, and inserts a pending
   `payment_refunds` reservation before contacting Paystack.
4. A database trigger independently prevents all non-failed refund rows from
   exceeding the original payment amount.
5. The server calls Paystack with the secret key. The browser never receives
   that key.
6. Signed refund webhooks reconcile `pending`, `processing`, `processed`,
   `failed`, and `needs-attention` states idempotently.

Store the refund API ID and webhook/processor reference separately. Match
refund evidence to the same payment, currency, amount, and environment.
An identifier-less event may match an unambiguous existing reservation even
after its API ID is stored. Ambiguous equal refunds require Paystack review;
never create another reservation merely because a webhook has no identifier.

A partial processed refund updates `payments.refunded_amount_cents` but leaves
the order paid and program access active. A fully processed refund marks the
payment/order refunded and revokes access tied to that order. If another paid
order independently grants the same program, that valid entitlement is kept.

Ambiguous network failures remain `needs-attention` and keep their amount
reserved. This intentionally blocks another refund until the Paystack dashboard
or a later webhook resolves the first request, preventing accidental duplicate
refunds.

## Payment recovery and disputes

PAY-05 recovery uses durable `payment_recovery_jobs` leases, bounded provider
reads, backoff, SES alerts, and a dedicated-token external scheduler endpoint.
See `docs/paystack-recovery.md` for activation and administrator enqueue/replay/
acknowledgement. Deferred prerequisite events remain `received` and can resume;
permanently invalid evidence stays auditable. Recovery never initiates charges
or refunds. Open disputes alert without revoking access; resolved accepted
disputes and verified reversals revoke the affected order, with sticky reversal
state and separate `payment_disputes` records. Never guess unknown bank outcomes.

## Customer access, email, and files

Purchase billing is documented in `docs/billing.md`. New checkout orders capture
original buyer name/email/phone. The disabled-by-default invoice worker shares
the protected recovery scheduler, issues immutable prepaid non-VAT purchase
snapshots, links exactly one settled payment, and creates provider-backed credit
notes without editing issued invoices. PDFs are private server-generated
documents, independent of program entitlement. SES uses durable versioned outbox
leases and required safe test-inbox routing. Manual/coaching billing uses
explicit draft/issue/evidenced-payment/refund commands, immutable corrections,
replacement links and evidence-backed legacy reviews. Never fabricate Paystack
outcomes through manual actions or grant program access merely by issuing a
coaching invoice. BILL-01 code is implemented locally; deployment, accountant
review and actual browser/provider/SES rollout evidence remain required.

After payment, the customer requests access using the purchase email address.
The Nuxt server asks Supabase Admin Auth to generate a passwordless token without
using Supabase SMTP. A branded HTML email is built in the project and delivered
through AWS SES.

The confirmation callback verifies the token, creates or reuses the integer-keyed
`users` row, links `clients.user_id`, and grants the customer role. Customer API
routes must verify the signed-in user's linked client and active
`program_access` before exposing program content.

Program PDFs are not attached to email and are not public. `program_files` stores
private Cloudflare R2 bucket/object metadata. After an entitlement check, the
server returns a short-lived presigned download URL.

R2 configuration uses separate environment-specific credentials: an Object
Read-only token for private customer downloads and an Object Read & Write token
for authenticated admin uploads to the matching public and private buckets.
Keep all R2 configuration in Nuxt/Fly runtime secrets, never in Fly TOML files.

## Security boundaries

- Only Nuxt server routes/services may import `@tilana/db/server` or
  `@tilana/email/server`, or access database, Supabase service-role, Paystack,
  Turnstile, AWS, and R2 credentials.
- Only Astro `PUBLIC_*` variables or Nuxt `runtimeConfig.public` values may
  reach browser code.
- Validate every external input. Require authentication and the correct role on
  admin routes, enforce ownership on customer routes, and use origin/abuse
  controls on state-changing or public endpoints.
- Do not add anonymous PostgreSQL write policies. Public writes must pass through
  validated server endpoints.
- Do not collect diagnoses, government identity numbers, or unnecessary health
  information in public forms.
- Never log or commit secrets, access tokens, customer magic links, `.env` files,
  generated output, dependencies, or build directories.

## Development and verification

Use pnpm from the repository root:

```text
pnpm dev             # public and admin development servers
pnpm dev:stop        # stop managed development servers
pnpm test            # run every Vitest suite through Turborepo
pnpm test:coverage   # run tests and write per-workspace coverage reports
pnpm check           # lint and typecheck every workspace
pnpm build:web       # public production build
pnpm build:admin     # admin/API production build
pnpm build           # complete production build
pnpm db:generate     # generate a Drizzle migration
pnpm db:check        # validate migration metadata/schema consistency
pnpm db:apply        # apply committed migrations
```

For a focused run, use `pnpm --filter @tilana/admin test` or
`pnpm --filter @tilana/web test`. During development, use the matching
`test:watch` script in either workspace.

Use `pnpm dev:stop` before replacing a managed Astro development process. Do not
silently rewrite an applied migration; create a new forward migration. Review
generated SQL before applying it, especially for destructive operations or UUID
to-integer conversions.

Keep changes compatible with `pnpm check` and the production build for every
affected application. Preserve the existing visual system, accessibility,
responsive behavior, and reduced-motion support.

Avoid em dashes in user-facing website copy. Prefer a full stop, comma,
parentheses, or a standard hyphen (` - `) when punctuation is needed.

Deployment behavior and environment variables are documented in
`docs/deployment.md`.

## Git and completion handoff

- Do not create a commit unless the user explicitly asks you to commit.
- Use Conventional Commits in the form `type(scope): concise imperative summary`.
- Appropriate types include `feat`, `fix`, `refactor`, `docs`, `test`, `build`,
  `ci`, and `chore`.
- After every completed task that changes repository files, always include one
  ready-to-copy Conventional Commit message in the final response, even when the
  user did not explicitly ask for one.
- The suggested message must describe the complete delivered change, not only
  the last file edited. Add a body only when migration, security, or operational
  context would otherwise be lost.
