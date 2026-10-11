# Deploying

Two apps, two environments, all from GitHub Actions.

| | Development (`dev` branch) | Production (`main` branch) |
|---|---|---|
| Admin (`apps/admin-next`) | Fly.io app `tilanavantonder-admin-dev`, `fly.toml` | Fly.io app `tilanavantonder-admin-prod`, `fly.prod.toml` |
| Admin address | https://admin-dev.tilanavantonder.co.za | https://admin.tilanavantonder.co.za |
| Website (`apps/web`) | Cloudflare Worker `tilanavantonder-website-dev` | Cloudflare Worker `tilanavantonder-website-prod` |
| When | Every push to `dev` | Manually: Actions > Deploy (production) > Run workflow on `main`, type `deploy` |

Each deploy runs, in order:

1. **Quality checks** (`quality.yml`): lint, types and all tests, with a throwaway Postgres for the admin's database tests.
2. **Admin**: database migrations (`pnpm db:migrate`), then `flyctl deploy` builds the root `Dockerfile` on Fly's builders and replaces the running machine once its health check (`/api/health`) passes.
3. **Website**: `pnpm --filter @tilana/web build`, then `wrangler deploy` of the Worker in `apps/web/dist/server`. It goes last because the website reads programs and prices from the admin.

Production can also deploy only the admin or only the website (the "What to deploy" choice).

The production admin always runs one machine (newsletter sending and the 5-minute order checks run inside it, and the website reads programs from it). The development admin sleeps when idle and wakes on the next request.

## One-time setup

### 1. Fly.io (the admin)

Install flyctl and sign in (`fly auth login`). The two apps already exist (they ran the old admin in London).

**Settings (Fly secrets).** Prepare a private file per environment with every setting from `apps/admin-next/.env.example` (never commit it), then import it:

```sh
fly secrets import -a tilanavantonder-admin-dev  < admin-dev.env
fly secrets import -a tilanavantonder-admin-prod < admin-prod.env
```

Production differences from development:

- `PAYSTACK_SECRET_KEY=sk_live_...` and `PAYSTACK_MODE=live`
- `EMAIL_DEV_REDIRECT_TO=` (empty, so emails reach the real people)
- `WEBSITE_URL=https://tilanavantonder.co.za` and `WEBSITE_ORIGINS=https://tilanavantonder.co.za,https://www.tilanavantonder.co.za`
- the production Supabase, database, R2 bucket and Turnstile secret
- `CRON_SECRET` can stay empty (the server checks orders itself)

Remove the old admin's settings: `fly secrets list -a <app>`, then `fly secrets unset NAME ... -a <app>` for every `NUXT_*` name.

**Move to Frankfurt** (next to Supabase). After the first deploy from GitHub:

```sh
fly scale count 1 --region fra -a tilanavantonder-admin-prod
fly machines list -a tilanavantonder-admin-prod     # note the London (lhr) machine ID
fly machine destroy <lhr-machine-id> --force -a tilanavantonder-admin-prod
```

Do the same for `tilanavantonder-admin-dev`.

**Deploy tokens** for GitHub (one per app, they can only deploy that app):

```sh
fly tokens create deploy -a tilanavantonder-admin-dev
fly tokens create deploy -a tilanavantonder-admin-prod
```

**Paystack webhook** (Paystack > Settings > API Keys & Webhooks): `https://admin.tilanavantonder.co.za/api/webhooks/paystack` for live, the dev address for test.

### 2. Cloudflare (the website)

The website used to be uploaded to Cloudflare **Pages** projects. It is now a **Worker** (static pages plus the pages that are built on request: home, programs, blog, checkout).

1. Create an API token (My Profile > API Tokens > "Edit Cloudflare Workers" template) for the account. Save it as the `CLOUDFLARE_API_TOKEN` secret (replacing the old Pages token) and the account ID as `CLOUDFLARE_ACCOUNT_ID`.
2. After the first deploy creates the Workers, move the domains: in Workers & Pages, open the old **Pages** project, remove its custom domain, then open the **Worker** > Settings > Domains & Routes > Add > Custom domain:
   - `tilanavantonder-website-prod`: `tilanavantonder.co.za` (and `www.tilanavantonder.co.za` if used)
   - `tilanavantonder-website-dev`: the development address
3. When the Workers answer on those domains, delete the old Pages projects.

### 3. GitHub (Settings > Secrets and variables > Actions)

Create two environments (Settings > Environments): `development` and `production`. For `production`, add yourself as a required reviewer if you want a second "approve" click.

**Secrets**

| Name | Value |
|---|---|
| `FLY_API_TOKEN_DEV`, `FLY_API_TOKEN_PROD` | The deploy tokens from step 1 |
| `DATABASE_URL_DEV`, `DATABASE_URL_PROD` | Supabase connection string for migrations. Use the **session pooler** string (Supabase > Connect), because GitHub's runners cannot reach the direct IPv6 address |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | From step 2 |

**Variables** (public values, they end up in the browser)

| Name | Value |
|---|---|
| `PUBLIC_TURNSTILE_SITE_KEY_DEV`, `PUBLIC_TURNSTILE_SITE_KEY_PROD` | Turnstile site keys (if they already exist as secrets, those keep working) |
| `PUBLIC_POSTHOG_KEY` | The PostHog project token (`phc_...`). Empty = no analytics |

The admin addresses (`PUBLIC_API_BASE_URL`) are fixed in the workflows; the old `PUBLIC_API_BASE_URL_*` secrets are no longer used and can be deleted.

## Everyday use

- Work on `dev`; pushing deploys development.
- When development looks right, merge `dev` into `main` and run **Deploy (production)**.
- A failed migration stops the deploy before anything is replaced.
- Roll back the admin: `fly releases -a <app>`, then `fly deploy --image <previous image> -a <app>`. Roll back the website: Workers & Pages > the Worker > Deployments > Rollback.
