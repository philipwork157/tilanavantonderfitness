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
- `PUBLIC_CONTACT_API_URL_DEV`
- `PUBLIC_NEWSLETTER_API_URL_DEV`
- `PUBLIC_CATALOGUE_API_BASE_URL_DEV`
- `PUBLIC_CHECKOUT_API_URL_DEV`
- `PUBLIC_CHECKOUT_STATUS_API_URL_DEV`
- `PUBLIC_ACCOUNT_URL_DEV`
- `PUBLIC_TURNSTILE_SITE_KEY_DEV`
- `PUBLIC_CONTACT_API_URL_PROD`
- `PUBLIC_NEWSLETTER_API_URL_PROD`
- `PUBLIC_CATALOGUE_API_BASE_URL_PROD`
- `PUBLIC_CHECKOUT_API_URL_PROD`
- `PUBLIC_CHECKOUT_STATUS_API_URL_PROD`
- `PUBLIC_ACCOUNT_URL_PROD`
- `PUBLIC_TURNSTILE_SITE_KEY_PROD`

The `PUBLIC_*` values are embedded in the public website at build time. Despite
being stored as GitHub secrets to match the workflow configuration, they are
public browser configuration and must never contain credentials.

Use these environment-specific values:

| GitHub secret | Development value |
| --- | --- |
| `PUBLIC_CONTACT_API_URL_DEV` | `https://admin-dev.tilanavantonder.co.za/api/contact` |
| `PUBLIC_NEWSLETTER_API_URL_DEV` | `https://admin-dev.tilanavantonder.co.za/api/newsletter/subscribe` |
| `PUBLIC_CATALOGUE_API_BASE_URL_DEV` | `https://admin-dev.tilanavantonder.co.za/api/public` |
| `PUBLIC_CHECKOUT_API_URL_DEV` | `https://admin-dev.tilanavantonder.co.za/api/checkout/paystack` |
| `PUBLIC_CHECKOUT_STATUS_API_URL_DEV` | `https://admin-dev.tilanavantonder.co.za/api/checkout/status` |
| `PUBLIC_ACCOUNT_URL_DEV` | `https://admin-dev.tilanavantonder.co.za/account/sign-in` |
| `PUBLIC_TURNSTILE_SITE_KEY_DEV` | Development Turnstile site key |

| GitHub secret | Production value |
| --- | --- |
| `PUBLIC_CONTACT_API_URL_PROD` | `https://admin.tilanavantonder.co.za/api/contact` |
| `PUBLIC_NEWSLETTER_API_URL_PROD` | `https://admin.tilanavantonder.co.za/api/newsletter/subscribe` |
| `PUBLIC_CATALOGUE_API_BASE_URL_PROD` | `https://admin.tilanavantonder.co.za/api/public` |
| `PUBLIC_CHECKOUT_API_URL_PROD` | `https://admin.tilanavantonder.co.za/api/checkout/paystack` |
| `PUBLIC_CHECKOUT_STATUS_API_URL_PROD` | `https://admin.tilanavantonder.co.za/api/checkout/status` |
| `PUBLIC_ACCOUNT_URL_PROD` | `https://admin.tilanavantonder.co.za/account/sign-in` |
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
- `NUXT_CONTACT_NOTIFICATION_ENABLED`
- `NUXT_EMAIL_FROM_ADDRESS`
- `NUXT_NEWSLETTER_FROM_EMAIL`
- `NUXT_NEWSLETTER_DEVELOPMENT_RECIPIENT`
- `NUXT_NEWSLETTER_API_BASE_URL`
- `NUXT_NEWSLETTER_SITE_URL`
- `NUXT_PAYSTACK_SECRET_KEY`
- `NUXT_PAYSTACK_ENVIRONMENT`
- `NUXT_PAYSTACK_CALLBACK_URL`
- `NUXT_ACCOUNT_BASE_URL`
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

`NUXT_PUBLIC_SITE_URL` is browser-visible configuration, not a secret. Each Fly
configuration sets it to the matching public website so admin preview links open
the correct development or production site.

`NUXT_CUSTOMER_ACCESS_DEVELOPMENT_RECIPIENT` is strongly recommended on the Fly
development app so test access emails cannot be delivered accidentally to a
customer. It must not redirect production customer emails.

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

### Purchase billing rollout (BILL-01)

ACCESS-01 rollout is documented in [customer-access-delivery.md](./customer-access-delivery.md).
Review both new customer notification migrations before backend deployment.
Enable `NUXT_CUSTOMER_NOTIFICATIONS_ENABLED=true` for the existing protected
scheduler to send purchase instructions and retry failed login emails. It
defaults to false. Test mode now requires a valid safe
`NUXT_CUSTOMER_ACCESS_DEVELOPMENT_RECIPIENT`; live never uses that redirect.
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
Configure Fly runtime `NUXT_INVOICE_BILLING_ENABLED=true`, plus required
`NUXT_INVOICE_DEVELOPMENT_RECIPIENT` in test mode and existing SES
credentials/verified sender. Live delivery never uses the test redirect.
The protected PAY-05 scheduler invokes billing after recovery; activate it
and monitor issuance/email backlogs independently. This does not move scheduling
to Fly cron or deploy anything. Historical purchases without original buyer
snapshots and inconsistent legacy invoice/client links need review, not invented
historical data or automatic financial ownership edits.

### Recovery worker rollout (PAY-05)

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
set the callback and account URLs shown in the Fly configuration table above.
Leaving the production app without `NUXT_PAYSTACK_SECRET_KEY` keeps production
checkout unavailable while the rest of the site can be deployed safely.

The backend rejects mismatched `sk_test_`/`sk_live_` secrets before provider
initialization, verification, refunds, or webhook processing. Deployed builds
require HTTPS non-local URLs for `NUXT_PAYSTACK_CALLBACK_URL`,
`NUXT_ACCOUNT_BASE_URL`, and `NUXT_PUBLIC_SITE_URL`. The callback must be exactly
the public-site origin plus `/checkout/complete`, without credentials, query,
or fragment; the account URL and public-site URL must be origins. Local HTTP
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
and AWS credentials used by contact notifications. Locally and on the Fly dev
application, `NUXT_CUSTOMER_ACCESS_DEVELOPMENT_RECIPIENT` can redirect delivery
to a safe test inbox; the link still authenticates as the intended paid test
customer. Production always delivers to the paid customer's email address.

Program PDFs are not email attachments. Upload each PDF to the private R2
program bucket and create an active `program_files` record containing its
integer `program_volume_id`, display name, R2 bucket, and object key. The
customer portal checks the signed-in customer's active `program_access` before
issuing a five-minute signed R2 download URL.

Before applying migration `20260906190429_same_black_cat.sql`, check for
duplicate case-insensitive client emails. The new unique index intentionally
stops two customer records from claiming the same verified email identity.
