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
- `PUBLIC_CHECKOUT_API_URL_DEV`
- `PUBLIC_CHECKOUT_STATUS_API_URL_DEV`
- `PUBLIC_ACCOUNT_URL_DEV`
- `PUBLIC_TURNSTILE_SITE_KEY_DEV`
- `PUBLIC_CONTACT_API_URL_PROD`
- `PUBLIC_NEWSLETTER_API_URL_PROD`
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
| `PUBLIC_CHECKOUT_API_URL_DEV` | `https://admin-dev.tilanavantonder.co.za/api/checkout/paystack` |
| `PUBLIC_CHECKOUT_STATUS_API_URL_DEV` | `https://admin-dev.tilanavantonder.co.za/api/checkout/status` |
| `PUBLIC_ACCOUNT_URL_DEV` | `https://admin-dev.tilanavantonder.co.za/account/sign-in` |
| `PUBLIC_TURNSTILE_SITE_KEY_DEV` | Development Turnstile site key |

| GitHub secret | Production value |
| --- | --- |
| `PUBLIC_CONTACT_API_URL_PROD` | `https://admin.tilanavantonder.co.za/api/contact` |
| `PUBLIC_NEWSLETTER_API_URL_PROD` | `https://admin.tilanavantonder.co.za/api/newsletter/subscribe` |
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

Non-sensitive Paystack environment, callback, and account URLs are pinned in
`fly.toml` and `fly.prod.toml`. Do not create Fly secrets with the same names;
Fly secrets override TOML environment values.

Keep sensitive runtime values in each Fly app's secret store. At minimum, audit
these names independently for development and production:

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
- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

`NUXT_CUSTOMER_ACCESS_DEVELOPMENT_RECIPIENT` is strongly recommended on the Fly
development app so test access emails cannot be delivered accidentally to a
customer. It must not redirect production customer emails.

Use separate Supabase projects and database URLs for development and production
when possible. If both Fly apps intentionally share one Supabase project during
early development, remember that clients and catalogue data are shared even
though Paystack rows record their test/live provider environment.

## Paystack and customer access

Paystack is currently test-only. Keep both Fly TOML environments set to `test`
and do not configure an `sk_live_...` key yet.

Configure the test secret only where test checkout should work:

- `NUXT_PAYSTACK_SECRET_KEY`

The value must be a Paystack `sk_test_...` key. The environment, callback, and
account URLs come from the matching Fly TOML. Leaving the production app without
`NUXT_PAYSTACK_SECRET_KEY` keeps production checkout unavailable while the rest
of the site can be deployed safely.

Only as part of a future reviewed go-live should all of the following happen
together:

1. Set `NUXT_PAYSTACK_ENVIRONMENT="live"` in `fly.prod.toml`.
2. Store the production `sk_live_...` key in the production Fly app only.
3. Configure and verify the production Paystack webhook URL.
4. Run a real low-value end-to-end payment, entitlement, email, download, and
   refund test.

Cloudflare R2 is implemented in the later program-catalogue storage phase. Its
current private-download configuration uses these server-only variables:

- `NUXT_R2_ACCOUNT_ID`
- `NUXT_R2_ACCESS_KEY_ID`
- `NUXT_R2_SECRET_ACCESS_KEY`

The R2 token should have read access only to the private program bucket. The
server returns five-minute presigned download URLs only after checking the
signed-in customer's active `program_access` row.

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
