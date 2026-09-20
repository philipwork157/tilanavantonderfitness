# Admin tests

From the repository root:

```sh
pnpm test
pnpm test:integration
pnpm --filter @tilana/admin test
pnpm check
```

The ordinary Vitest suite does not require a database or contact Paystack.
The separate PostgreSQL suite exercises the real payment service, transactions,
constraints, migrations, refunds, and entitlement grants with mocked provider
responses. It is not included in `pnpm test` or the ordinary coverage command.

## Payment integration tests

Start a disposable **local** PostgreSQL instance and create a fresh empty
database named `tilana_paystack_test_<unique_suffix>`. Use only lowercase
letters, digits, and underscores in the suffix. The database user must be able
to create schemas/tables and apply the repository migrations.

```sh
PAYSTACK_TEST_DATABASE_URL='postgres://test_user:test_password@127.0.0.1:5432/tilana_paystack_test_run1' \
  pnpm test:integration
```

Replace the example credentials with those for your disposable instance. Never
use an application or production database, or a tunnel to one. The test helper
requires an explicit test URL, a loopback hostname, the test database-name
prefix, no URL query options, and no existing user tables. It never falls back
to Nuxt/application database environment variables.

The helper creates a minimal `auth.users` bridge and applies the committed
Drizzle migrations. Each test creates its own purchase records. It closes its
connections afterward but **does not delete the database or its test data**;
use a new empty database for every run and discard the disposable instance when
finished. A failed migration also requires a new empty database on the next run.

The payment integration suite was verified on PostgreSQL 18. It includes a deterministic
row-lock test that holds a real webhook transaction before commit and verifies
that a concurrent stale verification cannot overwrite it, PAY-02 refund
identity/reordering cases, and PAY-03 durable checkout intent/concurrency cases.
The checkout cases share this entry point's empty database and actual migrations.
The required GitHub quality workflow runs this suite against a fresh PostgreSQL
service after lint, type, migration-history and ordinary Vitest checks. Both
development and production deployment workflows depend on that quality job, so
a failing financial regression cannot deploy. Provider calls, Supabase and SES
remain deterministic mocks; live-provider, deployed RLS, email-delivery and
browser smoke checks remain separate launch validation rather than CI tests.

The served-app Playwright suite now covers real browser checkout, confirmation,
email-link authentication and private-file HTTP authorization with local external
provider fixtures. See [browser checkout tests](../../../docs/browser-checkout-tests.md)
for `pnpm test:e2e`, safe database setup, CI gates and remaining live checks.
