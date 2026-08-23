# Deployment (Cloudflare Pages via GitHub Actions)

The public Astro site (`apps/web`) is deployed to **Cloudflare Pages** using
GitHub Actions and `wrangler`. Two existing Direct Upload projects are targeted:

| Environment | Cloudflare Pages project        | Trigger                          |
| ----------- | ------------------------------- | -------------------------------- |
| Dev         | `tilanavantonder-website-dev`   | Automatic on push to `dev`       |
| Prod        | `tilanavantonder-website-prod`  | Manual (Actions -> Run workflow) |

Workflows:

- `.github/workflows/deploy-web-dev.yml` — runs on every push to `dev`.
- `.github/workflows/deploy-web-prod.yml` — manual `workflow_dispatch` only.

The admin (Nuxt) app is intentionally **not** wired up yet.

## One-time setup

### 1. Create a Cloudflare API token

Cloudflare dashboard -> My Profile -> API Tokens -> Create Token -> Custom token:

- Permission: **Account -> Cloudflare Pages -> Edit**
- Account Resources: your account

Copy the token value (shown once).

### 2. Add GitHub repository secrets

Repo -> Settings -> Secrets and variables -> Actions -> **Secrets** tab:

- `CLOUDFLARE_API_TOKEN` — the token from step 1
- `CLOUDFLARE_ACCOUNT_ID` — your account ID (Cloudflare dashboard, starts `530e9a7d…`)

### 3. Create the GitHub Environments and their public variables

The static site bakes in a few **public** values at build time. Set them per
environment so dev and prod point at the right API URLs and Turnstile key.

Repo -> Settings -> Environments -> **New environment** (create both
`development` and `production`). In each, under **Environment variables**, add:

- `PUBLIC_CONTACT_API_URL`
- `PUBLIC_NEWSLETTER_API_URL`
- `PUBLIC_TURNSTILE_SITE_KEY`

Use the dev API URLs / test Turnstile key for `development`, and the live ones
(e.g. `https://admin.tilanavantonder.co.za/api/...`) for `production`.

These are public browser values (same as `apps/web/.env.example`), so
Variables — not Secrets — is the correct place for them.

### 4. (Recommended) Protect production

Repo -> Settings -> Environments -> `production` -> **Required reviewers**: add
yourself. Then every prod deploy pauses for a one-click approval before it runs.

## How to deploy

**Dev:** just `git push` to the `dev` branch. The dev workflow builds and
deploys automatically. (You can also trigger it manually from the Actions tab.)

**Prod:** GitHub -> **Actions** -> **Deploy web (prod)** -> **Run workflow** ->
pick the `main` branch -> type `deploy` in the confirm box -> **Run workflow**.
Approve if reviewers are configured.

## Notes

- The build command is `pnpm build:web`, which outputs the static site to
  `apps/web/dist/client`; that folder is what gets uploaded to Pages.
- Both deploys pass `--branch=main` so they publish to each project's
  **production** deployment (and update any custom domain). If a project's
  Production branch is set to something other than `main` (Pages project ->
  Settings), update the `--branch=` value in the matching workflow — otherwise
  the upload lands as a *preview* deployment instead of production.
- No `wrangler.toml` is required for `wrangler pages deploy`.
