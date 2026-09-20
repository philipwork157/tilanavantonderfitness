# Browser checkout and customer access tests (REAUDIT-02)

The Playwright suite serves the real Astro frontend and Nuxt backend against
committed migrations in disposable PostgreSQL. It supplements Vitest.

## Run locally

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

Create a fresh empty database in a disposable **local** PostgreSQL instance,
then run with that instance's test credentials:

```sh
E2E_DATABASE_URL='postgres://test_user:test_password@127.0.0.1:5432/tilana_paystack_test_browser_run1' \
  pnpm test:e2e
```

Never use an application database or a tunnel to a deployed database. The URL
must use loopback, the `tilana_paystack_test_<lowercase_suffix>` database name,
and no query options. Nonempty databases are refused. Connections are closed,
but the database is not deleted: use a new empty database each run and discard
the disposable instance afterward. Application database credentials are never
used as fallback.

Ports 4310–4312 must be free; existing listeners are rejected. The launcher uses
separate caches and foreground processes. It supplies explicit test credentials
instead of loading the developer's Nuxt `.env`; Astro uses an isolated
environment-file directory. `pnpm check` includes the harness TypeScript check.

Failures retain ignored screenshots/traces under `test-results/`. Open one with
`pnpm exec playwright show-trace <trace.zip>`. Traces may contain synthetic
session tokens; do not use real customer data or publish artifacts without review.

## Real application boundaries and external fixtures

Normal application code handles catalogue queries, basket DOM/events/storage,
contracts, origin/challenge checks, idempotency, transactions, verification,
notification queues, branded email rendering, HTTP session cookies, integer
account linking, entitlements and file authorization.

Only external boundaries are fixtures: Paystack, Turnstile, Supabase Auth, SES,
and remote media/fonts. SES sends only to a local capture endpoint with dummy
credentials. The test preload intercepts provider fetches and rejects other
non-local fetch traffic. Browser routing blocks unexpected external requests.
The runner supplies a dedicated trusted-ingress header configured only in its
local Nuxt process; deployed proxy guarantees remain a separate launch check.
Production application code contains no test payment or authentication bypass.

## Coverage and regressions found

- A two-volume UI purchase retries a lost server response with the same intent,
  initializes the provider once, verifies totals/line counts, and grants access
  only after successful server verification.
- Native browser status polling confirms payment and clears the paid basket.
  This exposed an invalid native-fetch receiver in `dependencies.fetch(...)`;
  the helper now calls the injected fetch as a standalone function.
- The real sign-in form sends branded email to the local capture. Following its
  one-time link after closing the checkout page establishes HttpOnly cookies,
  links the account and lists both volumes. Reusing the token is rejected.
- This exposed the callback recreating its Supabase client after verification,
  losing the new session before linking. The client is now cached only within
  that H3 request context. Unit tests verify separate requests never share it.
- Cross-tab additions/removal update checkout, duplicate submit events do not
  create another payment, and pending/failed outcomes retain selections without
  granting access.
- A purchased file returns a signed redirect, another programme's file returns
  404, and an unsigned request returns 401. No real R2 download occurs.
- Actual HTTP routes reject foreign checkout origins and missing challenges.

The reusable quality workflow creates a separate browser database, installs
Chromium and runs this suite after Vitest/integration checks. Both deployment
workflows depend on that gate, so a browser failure blocks deployment. Hosted
CI itself has not been triggered by the local implementation.

Real provider transactions, SES deliverability, deployed Supabase/proxy/RLS/R2
configuration and an authorized live smoke test remain launch requirements.
