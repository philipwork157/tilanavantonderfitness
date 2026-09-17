# Admin tests

From the repository root:

```sh
pnpm test
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
  pnpm --filter @tilana/admin test:integration
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

The PAY-01 suite was verified on PostgreSQL 18. It includes a deterministic
row-lock test that holds a real webhook transaction before commit and verifies
that a concurrent stale verification cannot overwrite it. These tests do not
exercise live Paystack requests, HTTP signature handling, full Supabase auth,
deployed RLS/grants, email delivery, or browser checkout. Those remain separate
launch requirements in the [readiness audit](../../../docs/audits/2026-09-17-paystack-production-readiness.md).
