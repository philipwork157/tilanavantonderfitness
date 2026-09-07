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

The workflow can also be started manually from GitHub's Actions UI.

## Production workflow

Merging or pushing to `main` starts **Build and deploy (production)** and builds
both applications in parallel. A push never deploys; it only verifies that the
production source builds successfully.

To deploy from the GitHub UI:

1. Open **Actions** -> **Build and deploy (production)** -> **Run workflow**.
2. Select the `main` branch.
3. Choose `both`, `public`, or `admin` in **What should be deployed?**.
4. Type `deploy` in the confirmation field and click **Run workflow**.
5. Approve the `production` environment if required reviewers are enabled.

Only the selected application builds and deploys during a manual run. Selecting
`both` runs the two build jobs concurrently and then starts both deployment jobs.

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

## Production protection

Create a GitHub environment named `production` under **Settings ->
Environments**. Add yourself as a required reviewer if you want the deployment
jobs to pause for approval after their builds pass. Keep the secrets listed
above at repository scope because the build jobs and development workflow also
need the relevant values.

Cloudflare Direct Upload uses `apps/web/dist/client`. Both Cloudflare deploys
pass `--branch=main`, which publishes to each Pages project's production branch.
No `wrangler.toml` is required.

## Paystack and customer access

Configure these server-only Fly secrets independently on the development and
production admin applications:

- `NUXT_PAYSTACK_SECRET_KEY`
- `NUXT_PAYSTACK_ENVIRONMENT` (`test` or `live`)
- `NUXT_PAYSTACK_CALLBACK_URL`
- `NUXT_ACCOUNT_BASE_URL`
- `NUXT_R2_ACCOUNT_ID`
- `NUXT_R2_ACCESS_KEY_ID`
- `NUXT_R2_SECRET_ACCESS_KEY`

The R2 token should have read access only to the private program bucket. The
server returns five-minute presigned download URLs only after checking the
signed-in customer's active `program_access` row.

In Paystack, configure the webhook URL as
`https://ADMIN_HOST/api/webhooks/paystack`. The callback URL should be the
public `https://PUBLIC_HOST/checkout/complete` page.

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
