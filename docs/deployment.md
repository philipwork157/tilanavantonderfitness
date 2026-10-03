# Deployment (GitHub Actions)

The platform has two applications and two deployment environments:

| Application | Development | Production |
| --- | --- | --- |
| Public Astro website | Cloudflare Pages: `tilanavantonder-website-dev` | Cloudflare Pages: `tilanavantonder-website-prod` |
| Nuxt admin website | Fly.io: `tilanavantonder-admin-dev` | Fly.io: `tilanavantonder-admin-prod` |

## Development workflow

Pushing to `dev` starts **Build and deploy (dev)**. Its public and admin jobs run
in parallel. Each job first builds its application and only deploys when that
build succeeds:

- Public: `pnpm build:web`, then Cloudflare Pages.
- Admin: `pnpm build:admin`, then Fly.io using `fly.toml`.

There are intentionally no path filters. Every push to `dev`, including shared
package or workflow changes, builds and deploys both applications. The public
job validates all required URLs and the Turnstile site key before it installs
dependencies or builds, preventing a missing GitHub secret from embedding a
localhost fallback in the deployed site.

The workflow can also be started manually from GitHub's Actions UI.

## Production workflow

Merging or pushing to `main` does not start a production build or deployment.
Production is manual-only. The repository's production branch is named `main`
(not `master`).

To deploy from the GitHub UI:

1. Open **Actions** -> **Build and deploy (production)** -> **Run workflow**.
2. Select the `main` branch.
3. Choose `both`, `public`, or `admin` in **What should be deployed?**.
4. Type `deploy` in the confirmation field and click **Run workflow**.
5. Approve the `production` environment if required reviewers are enabled.

Only the selected application builds and deploys during a manual run. Selecting
`both` runs the two build jobs concurrently and then starts both deployment jobs.
The workflow refuses to run from a branch other than `main` and requires the
explicit `deploy` confirmation.

## Required GitHub secrets

Add these under **Settings -> Secrets and variables -> Actions -> Secrets**:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `FLY_API_TOKEN` (development Fly app)
- `FLY_API_TOKEN_PROD` (production Fly app)
- `PUBLIC_API_BASE_URL_DEV`
- `PUBLIC_TURNSTILE_SITE_KEY_DEV`
- `PUBLIC_API_BASE_URL_PROD`
- `PUBLIC_TURNSTILE_SITE_KEY_PROD`

The `PUBLIC_*` values are embedded in the public website at build time. Despite
being stored as GitHub secrets to match the workflow configuration, they are
public browser configuration and must never contain credentials.

Use these environment-specific values:

| GitHub secret | Development value |
| --- | --- |
| `PUBLIC_API_BASE_URL_DEV` | `https://admin-dev.tilanavantonder.co.za` |
| `PUBLIC_TURNSTILE_SITE_KEY_DEV` | Development Turnstile site key |

| GitHub secret | Production value |
| --- | --- |
| `PUBLIC_API_BASE_URL_PROD` | `https://admin.tilanavantonder.co.za` |
| `PUBLIC_TURNSTILE_SITE_KEY_PROD` | Production Turnstile site key |

GitHub returns an empty string when a referenced secret does not exist. The
workflow therefore runs `apps/web/scripts/validate-public-deployment-env.mjs` before a
public build and fails with the missing or cross-environment variable name.

## Production protection

Create a GitHub environment named `production` under **Settings ->
Environments**. Add yourself as a required reviewer if you want the deployment
jobs to pause for approval after their builds pass. Keep the secrets listed
above at repository scope because the build jobs and development workflow also
need the relevant values.

Cloudflare Direct Upload uses `apps/web/dist/client`. Both Cloudflare deploys
pass `--branch=main`, which publishes to each Pages project's production branch.
No `wrangler.toml` is required.

## Fly.io configuration

### Local versus deployed request identity (REAUDIT-03)

Use `http://localhost:4321` for the public development site and
`http://localhost:3001` for the local admin/API. Keep local callback URLs,
public API settings, and browser sessions on this hostname. Numeric loopback
addresses remain valid IP values in security checks and isolated test fixtures;
changing a browser hostname does not fix missing request-IP information.

Nuxt's local dev proxy uses a Unix socket, which has no network IP address.
With no trusted-header override, the request-identity helper assigns that
readable/writable local transport one shared loopback rate-limit identity.
This applies only in `NODE_ENV=development` outside Fly. It never trusts
forwarded headers, masks an invalid IP, or enables a production fallback.

For direct local `pnpm dev`, leave `NUXT_TRUSTED_CLIENT_IP_HEADER` **unset**.
The committed admin environment example deliberately comments it out. If an
older copy of `apps/admin/.env` sets it to `fly-client-ip`, remove that override
(including any shell override) and restart the development server. Local requests
then use the socket address; arbitrary forwarded headers are ignored.

Both deployed Fly apps run production builds and must use
`NUXT_TRUSTED_CLIENT_IP_HEADER=fly-client-ip` in runtime secrets. Never copy a
local empty override to a deployment. The production default also selects that
header, and missing, invalid or multi-address values fail with HTTP 403 without
falling back to another header or the proxy socket. Restrict ingress to the
trusted proxy and verify its header overwrite behavior before launch; a header
name alone does not authenticate a proxy. A different hosting/proxy chain needs
its own reviewed configuration. This local fix does not verify deployed ingress.

Both Fly configurations use the same Dockerfile and Nitro Node server:

| Setting | Development | Production |
| --- | --- | --- |
| Fly app | `tilanavantonder-admin-dev` | `tilanavantonder-admin-prod` |
| Custom hostname | `admin-dev.tilanavantonder.co.za` | `admin.tilanavantonder.co.za` |
| Region | `lhr` | `lhr` |
| Internal port | `3000` | `3000` |
| Paystack environment | `test` | `test` until explicit go-live |
| Paystack callback | Development public site | Production public site |
| Account base URL | Development admin site | Production admin site |

`NODE_ENV=production` is correct for both deployed applications because both run
an optimized server build. The Fly app name and environment-specific URLs
separate development delivery behavior from production behavior.

Paystack configuration is intentionally not stored in either Fly TOML file.
Configure it together with the sensitive runtime values in each Fly app's
secret store. Audit these names independently for development and production:

- `NUXT_DATABASE_URL`
- `NUXT_SUPABASE_URL`
- `NUXT_SUPABASE_PUBLISHABLE_KEY`
- `NUXT_SUPABASE_SERVICE_ROLE_KEY`
- `NUXT_CONTACT_ALLOWED_ORIGINS`
- `NUXT_TURNSTILE_SECRET_KEY`
- `NUXT_CONTACT_IP_HASH_SECRET`
- `NUXT_TRUSTED_CLIENT_IP_HEADER` (`fly-client-ip` on both Fly deployments)
- `NUXT_CONTACT_NOTIFICATION_ENABLED`
- `NUXT_EMAIL_FROM_ADDRESS`
- `NUXT_NEWSLETTER_FROM_EMAIL`
- `NUXT_EMAIL_DEVELOPMENT_ENABLED`
- `NUXT_EMAIL_DEVELOPMENT_RECIPIENT`
- `NUXT_ACCOUNT_BASE_URL`
- `NUXT_PAYSTACK_SECRET_KEY`
- `NUXT_PAYSTACK_ENVIRONMENT`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

`NUXT_PUBLIC_SITE_URL` is browser-visible configuration, not a secret. Each Fly
configuration sets it to the matching public website so admin preview links open
the correct development or production site.

`NUXT_EMAIL_DEVELOPMENT_ENABLED=true` routes every SES email to the single
`NUXT_EMAIL_DEVELOPMENT_RECIPIENT`, including contact and recovery notifications.
Test customer/invoice delivery requires the switch and a valid inbox. Live
customer/invoice delivery rejects an enabled switch. Newsletter previews use
the same inbox even when the switch is disabled.

Use separate Supabase projects, database URLs, and private storage resources for
development and live production. Sharing resources is not an approved live
deployment architecture. Before go-live, review customer/catalogue migration
separately and retain test financial history in the isolated test database.
Never relabel test payments as live or delete financial records to enable checkout.

PAY-04 enforces a single Paystack environment per application database. Any
Paystack row with a different or unknown environment quarantines payment
operations and customer access with HTTP 503, including already-linked sessions
and private download requests. Manual payments are unaffected by the mode
predicate. Therefore changing a database containing test payments to `live`
does not enable production access: provision and review an isolated live database.
The runtime guard is not a replacement for separate Supabase/auth and bucket
credentials, nor a validation of deployed infrastructure permissions.
The known Fly deployments also enforce their purpose: `admin-dev` permits only
test mode and `admin-prod` only live mode for payments/customer access. The
production portal's current test-mode setting therefore deliberately keeps
these features unavailable until reviewed go-live. Run pre-launch payment tests
on isolated development resources, not against production private files. A
future non-Fly deployment must establish the equivalent deployment-mode policy.

## Paystack and customer access

### Evidence retention upgrade (REAUDIT-05/06)

Follow [payment evidence upgrade](./payment-evidence-upgrade.md) before applying
`20260921052610_bound_payment_evidence.sql`. If the database is blocked before
SEC-02 by non-object JSON `data`, use the reviewed preparatory SQL on that
preceding schema; do not rewrite or skip the existing migration. Pause all
payment writers for the digest-column/application handover. No deployed
migration or preparation was performed locally.

### Settled-purchase guard rollout (REAUDIT-01)

Review `20260920035033_protect_settled_purchases.sql` and follow the preflight and
writer handover in [settled-purchase-protection.md](./settled-purchase-protection.md).
It adds no tables and does not repair legacy mismatches automatically. Only
disposable local databases have been migrated. The shared quality gate also
runs [browser checkout tests](./browser-checkout-tests.md) against real local
Astro/Nuxt processes and a separate disposable database.

### Entitlement rollout (ACCESS-02)

Review/apply `20260918075403_superb_paper_doll.sql` before deploying the updated
admin/API code. Pause financial/grant writers during the migration and version
handover; it removes single-active-grant uniqueness and repairs only missing
grants backed by matching settled Paystack purchases. Existing revoked/expired
grants remain unchanged. Review repair candidates and inconsistent legacy
histories first. See [program-entitlements.md](./program-entitlements.md).
This migration was exercised only in a disposable local PostgreSQL cluster;
no deployed migration, activation or real-provider check was performed.

### Program delivery rollout (ACCESS-03)

After ACCESS-02, review/apply `20260919132857_protect_program_delivery.sql`
before deploying the updated admin/API. Pause checkout, webhook/recovery and
catalogue writes for the migration/version handover. Preflight all active or
future grants and open/paid Paystack orders for at least one ready private file
in the correct environment bucket; repair missing metadata/R2 objects first.
The trigger prevents new final-file withdrawals but cannot repair historical
missing content. See [program-delivery-protection.md](./program-delivery-protection.md).
No deployed migration or real R2/provider check was performed locally.

### Purchase billing rollout (BILL-01)

ACCESS-01 rollout is documented in [customer-access-delivery.md](./customer-access-delivery.md).
Review both new customer notification migrations before backend deployment.
Enable `NUXT_CUSTOMER_NOTIFICATIONS_ENABLED=true` for the existing protected
scheduler to send purchase instructions and retry failed login emails. It
defaults to false. Test mode now requires `NUXT_EMAIL_DEVELOPMENT_ENABLED=true` and a valid safe
`NUXT_EMAIL_DEVELOPMENT_RECIPIENT`; live never uses that redirect.
No deployed migrations, activation or real SES sends were performed locally.

Follow [billing.md](./billing.md) before activation. Review/apply
`20260917155837_polite_shockwave.sql` and
`20260917155928_marvelous_iron_patriot.sql`; these invoice migrations have been
tested only in disposable local databases. Billing defaults to disabled.
The manual/coaching, reissue and review implementation additionally requires
`20260918054700_free_spirit.sql`, `20260918054905_steady_quasar.sql` and
`20260918060107_grey_spot.sql`. Review all forward SQL, existing relationships
and accounting policy before deployment. Nothing here adopts legacy manual
invoice rows automatically or authorizes deployed database changes. Verify
actual browser guards/ownership, issued-but-unpaid billing login, confirmed
manual receipt/refund, void/full-credit replacement and separate original/reissue
PDF downloads before enabling customer delivery.
Configure Fly runtime `NUXT_INVOICE_BILLING_ENABLED=true`, plus `NUXT_EMAIL_DEVELOPMENT_ENABLED=true` and required
`NUXT_EMAIL_DEVELOPMENT_RECIPIENT` in test mode and existing SES
credentials/verified sender. Live delivery never uses the test redirect.
The protected PAY-05 scheduler invokes billing after recovery; activate it
and monitor issuance/email backlogs independently. This does not move scheduling
to Fly cron or deploy anything. Historical purchases without original buyer
snapshots and inconsistent legacy invoice/client links need review, not invented
historical data or automatic financial ownership edits.

### Recovery worker rollout (PAY-05)

REAUDIT-04 adds `20260921051739_retain_recovery_actor.sql`. Pause scheduler and
administrator recovery actions for the migration/application handover, review
legacy unattributed rows, and follow [recovery audit retention](./recovery-audit-retention.md).
Do not resume old writers or cleanup code after migration. No deployed database
was migrated by the local implementation.

Review and apply `20260917151828_bored_sebastian_shaw.sql` before deploying the
recovery service. It has been applied only in disposable local test databases.
Recovery defaults to disabled and requires new Fly runtime secrets plus a
matching GitHub scheduler token and SES operator mailbox. The external workflow
wakes scale-to-zero Fly apps, but GitHub cron is best-effort and only runs from
the default branch. Configure independent heartbeat/backlog monitoring and
workflow failure notifications before live activation. Follow the complete
checklist and admin replay/dispute policy in [paystack-recovery.md](./paystack-recovery.md).

### Checkout/refund schema rollout (PAY-02/PAY-03)

Apply the reviewed forward migrations
`20260917143554_concerned_living_mummy.sql` (refund references) and
`20260917144154_careful_arachne.sql` (checkout intent hashes/uniqueness) before
deploying the updated admin service. Review the intended database URL and
normal migration safeguards first. These migrations have been exercised only
in a disposable local test database; this task does not apply them to deployed
environments.

The public checkout and both checkout API contracts now require
`idempotencyKey`. Coordinate the admin/public rollout with checkout paused
(for example, keep its Paystack secret unconfigured until both versions are
deployed). The dev deployment jobs run in parallel and do not coordinate
database migrations. An older backend ignores the new key; an older frontend
is rejected by the new backend. Do not accept payment traffic during that
mixed-version window. Existing payments/webhooks remain valid with null hashes.

Validate retries, lost-response recovery, null-reference refunds, and the
test/live environment boundary in the isolated test environment before
reenabling checkout. See [checkout-idempotency.md](./checkout-idempotency.md)
for uncertain initialization review. Never retry one manually by inventing a
new reference without resolving the existing provider attempt.

### Provider and customer configuration

Paystack is currently test-only. Configure `NUXT_PAYSTACK_ENVIRONMENT=test` in
both Fly apps and do not configure an `sk_live_...` key yet. Where test checkout
should work, configure `NUXT_PAYSTACK_SECRET_KEY` with an `sk_test_...` key and
set the public-site and account URLs shown in the Fly configuration table above.
Leaving the production app without `NUXT_PAYSTACK_SECRET_KEY` keeps production
checkout unavailable while the rest of the site can be deployed safely.

The backend rejects mismatched `sk_test_`/`sk_live_` secrets before provider
initialization, verification, refunds, or webhook processing. Deployed builds
require HTTPS non-local URLs for `NUXT_ACCOUNT_BASE_URL` and `NUXT_PUBLIC_SITE_URL`. The callback is derived from
the public-site origin plus `/checkout/complete`; both configured URLs must be
origins without credentials, query, or fragment. Local HTTP
defaults are supported only for local test development, not deployed dev builds
or live mode. These checks are request-time failures, so an intentionally
unconfigured checkout does not prevent unrelated admin pages from starting.

Only as part of a future reviewed go-live should all of the following happen
together:

1. Change the production Fly secret `NUXT_PAYSTACK_ENVIRONMENT` to `live`.
2. Store the production `sk_live_...` key in the production Fly app only.
3. Configure and verify the production Paystack webhook URL.
4. Run a real low-value end-to-end payment, entitlement, email, download, and
   refund test.

Cloudflare R2 catalogue storage uses these server-only variables:

- `NUXT_R2_ACCOUNT_ID`
- `NUXT_R2_PUBLIC_MEDIA_BUCKET`
- `NUXT_R2_PUBLIC_MEDIA_BASE_URL`
- `NUXT_R2_PRIVATE_PROGRAM_BUCKET`
- `NUXT_R2_DOWNLOAD_ACCESS_KEY_ID`
- `NUXT_R2_DOWNLOAD_SECRET_ACCESS_KEY`
- `NUXT_R2_UPLOAD_ACCESS_KEY_ID`
- `NUXT_R2_UPLOAD_SECRET_ACCESS_KEY`

Configure them in the matching Fly application's secret store, not in either
Fly TOML file. Use these non-credential values:

| Variable | Development | Production |
| --- | --- | --- |
| `NUXT_R2_PUBLIC_MEDIA_BUCKET` | `tilanavantonder-dev-public-media` | `tilanavantonder-prod-public-media` |
| `NUXT_R2_PUBLIC_MEDIA_BASE_URL` | `https://media-dev.tilanavantonder.co.za` | `https://media.tilanavantonder.co.za` |
| `NUXT_R2_PRIVATE_PROGRAM_BUCKET` | `tilanavantonder-dev-private-programs` | `tilanavantonder-prod-private-programs` |

The download token must have Object Read-only access to the matching private
program bucket. The upload token must have Object Read & Write access only to
the matching public-media and private-program buckets. Development and
production must use separate credentials. The server returns five-minute
presigned download URLs only after checking the signed-in customer's active
`program_access` row.

For test mode, configure Paystack's webhook as
`https://admin-dev.tilanavantonder.co.za/api/webhooks/paystack`. The development
callback is `https://website-dev.tilanavantonder.co.za/checkout/complete`.

Customer access emails are sent directly by the Nuxt server through AWS SES;
Supabase SMTP is not used. The server-only Supabase administrative client calls
`auth.admin.generateLink()` without triggering an email, and the branded SES
message links its token hash to
`https://ADMIN_HOST/api/customer/auth/confirm`. Configure the same SES sender
and AWS credentials used by contact notifications. Development delivery uses the shared switch and inbox documented above.
Live customer delivery requires the switch to be disabled and delivers to the
paid customer's email address.

Program PDFs are not email attachments. Upload each PDF to the private R2
program bucket and create an active `program_files` record containing its
integer `program_volume_id`, display name, R2 bucket, and object key. The
customer portal checks the signed-in customer's active `program_access` before
issuing a five-minute signed R2 download URL.

Before applying migration `20260906190429_same_black_cat.sql`, check for
duplicate case-insensitive client emails. The new unique index intentionally
stops two customer records from claiming the same verified email identity.

## Consolidated environment configuration

The public application now uses only `PUBLIC_API_BASE_URL` and
`PUBLIC_TURNSTILE_SITE_KEY`. Endpoint paths are fixed in code. Admin newsletter
confirmation links use `NUXT_ACCOUNT_BASE_URL`; newsletter redirects, unsubscribe
links and Paystack callbacks use `NUXT_PUBLIC_SITE_URL`.

Before deploying this version, create GitHub secrets `PUBLIC_API_BASE_URL_DEV`
and `PUBLIC_API_BASE_URL_PROD` with the origins above. In Fly runtime secrets,
set `NUXT_ACCOUNT_BASE_URL` to the matching admin origin; set
`NUXT_EMAIL_DEVELOPMENT_ENABLED=true` and `NUXT_EMAIL_DEVELOPMENT_RECIPIENT` to
the safe inbox on development. Production live customer/invoice delivery requires
`NUXT_EMAIL_DEVELOPMENT_ENABLED=false`. The inbox remains available for explicit
newsletter previews. These changes are configuration instructions, not evidence
of a deployed update.

Remove old per-endpoint public URL settings and the admin
`NUXT_NEWSLETTER_API_BASE_URL`, `NUXT_NEWSLETTER_SITE_URL`,
`NUXT_PAYSTACK_CALLBACK_URL`, `NUXT_NEWSLETTER_DEVELOPMENT_RECIPIENT`,
`NUXT_CUSTOMER_ACCESS_DEVELOPMENT_RECIPIENT`, and
`NUXT_INVOICE_DEVELOPMENT_RECIPIENT` settings after migrating. They are no longer
read. Existing feature activation switches remain independent of email routing.
