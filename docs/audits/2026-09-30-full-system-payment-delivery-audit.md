# Full system payment and programme-delivery audit - 30 September 2026

Reviewed base revision: `78317fa`, plus the dependency remediation described
below. This was a source, configuration, dependency and local verification
review. It was not a penetration test, deployment, database migration, real
payment, real email send or production certification.

## Verdict

The requested customer journey is implemented end to end in the repository:

1. The public Astro site loads server-owned programme and price data, collects
   guest details and starts a hosted Paystack basket checkout.
2. The Nuxt backend creates immutable order lines and a pending payment using a
   durable browser intent key. It never trusts the browser total.
3. Signed Paystack webhooks or server-side verification confirm the reference,
   environment, amount, currency and status before the order is paid.
4. Successful settlement grants an independent entitlement for every purchased
   programme volume and queues customer access instructions.
5. Administrators upload PDFs through short-lived signed Cloudflare R2 upload
   URLs. Finalization verifies the stored object before it becomes deliverable.
6. The customer requests a passwordless email using the purchase address. The
   callback links the verified Supabase identity to the integer client record.
7. The signed-in portal lists active entitlements and returns a five-minute R2
   download URL only after checking customer ownership and file state.

The local implementation is suitable for a coordinated, isolated Paystack test
rollout. It is **not approved for live payments** until the environment and
manual acceptance gates in the existing rollout checklist have evidence.

## Direct answers

### Can customers pay from the frontend?

Yes. `apps/web/src/pages/checkout/index.astro` submits the basket contract to
`POST /api/checkout/paystack/basket` and redirects only to Paystack's hosted
checkout URL. The server reads authoritative prices, requires an active ready
file, snapshots the order, and initializes Paystack with a server-only secret.
The return page polls a server status endpoint; the browser redirect is never
treated as proof of payment.

### Can the backend upload files for new programmes?

Yes. Authenticated administrators can create programmes and volumes, reserve a
private PDF upload, upload directly to the matching R2 bucket, and finalize or
atomically replace the file. Upload and download credentials are separate. A
programme cannot be purchased without a ready PDF in the configured private
bucket, and the final file owed to customers cannot be silently withdrawn.

### Is an email sent after checkout?

Yes, when background delivery is configured and enabled. Payment fulfillment
atomically writes a durable purchase notification. The worker sends branded
access instructions through AWS SES. A later sign-in request generates a fresh
one-time Supabase token and sends it through the same SES path.

The PDF is deliberately **not attached** to email. Email contains a portal or
one-time sign-in link; the file remains private and is authorized at download
time. This prevents forwarded email attachments or permanent public URLs from
bypassing refunds, expiry and customer ownership checks.

The operational caveat is important: `NUXT_CUSTOMER_NOTIFICATIONS_ENABLED`
defaults to false. No purchase email will leave the outbox until the protected
scheduler, SES settings and safe development recipient are configured.

### Can the buyer log in and access the purchase?

Yes. The buyer uses the same email address captured on the paid order. A
verified passwordless callback creates or reuses the application user, links
the matching client and grants the customer role. The portal then checks the
linked client and active `program_access` rows before listing files or issuing a
signed R2 redirect. A different customer receives 404 for a file they do not
own. Paid invoice history is exposed through separate ownership-checked routes.

## Security and correctness review

No new payment or entitlement logic defect was confirmed in this review.
Existing controls cover the material boundaries:

- Prices and totals are calculated from published database volumes; money is
  stored in integer cents and order items remain immutable snapshots.
- Checkout intent hashes and database locks prevent duplicate initialization
  and bind retries to the original customer and basket.
- Checkout uses origin, Turnstile, honeypot and shared rate-limit controls.
- Webhooks validate the HMAC over the untouched raw body before parsing.
- Fulfillment checks provider reference, test/live environment, successful
  state, exact amount and currency inside an idempotent transaction.
- Recovery handles uncertain initialization and delayed or out-of-order
  provider evidence without inventing payment outcomes.
- Full refunds and verified reversals revoke only that order's entitlements;
  another independent paid grant survives.
- Admin mutation routes require a verified administrator and same-origin
  request. Customer routes require a verified session, linked client and role.
- Private PDF metadata contains bucket/object identity, not a public URL.
  Downloads use a read-only credential and five-minute signed URL.
- Database constraints, RLS and forward migrations provide additional guards,
  while server routes still enforce authorization because the server connection
  bypasses RLS.

## Finding remediated during this audit

### AUDIT-08 - vulnerable production dependency graph

The fresh npm advisory scan initially reported 24 production advisories: 10
high, 9 moderate and 5 low. Affected packages included direct `sharp` and
`undici` versions plus transitive `js-yaml`, `svgo`, `devalue`,
`brace-expansion`, `esbuild` and `@ai-sdk/provider-utils` versions.

Remediation:

- updated `sharp` to `^0.35.5` and `undici` to `8.11.2`;
- aligned the admin workspace with Drizzle ORM `^0.45.3` so the refreshed graph
  uses one compatible application ORM patch version;
- added a bounded `@ai-sdk/provider-utils` override for vulnerable 4.0 builds;
- refreshed the lockfile to patched in-range transitive releases;
- verified that the final graph has no peer-dependency conflicts.

Result: `pnpm audit --prod` reports **0 known production advisories**.

The complete development graph still reports one moderate esbuild advisory
through `drizzle-kit -> @esbuild-kit`, a local schema-tooling path that is not
shipped in either application. The registry recommends `esbuild >=0.24.3`, but
that release is not published. Forcing a different esbuild line created peer
conflicts and was not retained. Track the upstream Drizzle toolchain update;
do not weaken the compatible build graph merely to suppress the scanner row.

## Fresh verification

| Check | Result |
| --- | --- |
| Admin unit tests | 270 passed across 36 files |
| Web unit tests | 75 passed across 6 files |
| Lint and type checks | Passed for all workspaces |
| E2E harness TypeScript check | Passed |
| Migration consistency (`pnpm db:check`) | Passed |
| Peer dependency validation | No issues |
| Admin production build | Passed, forced fresh build |
| Web production build | Passed, forced fresh build |
| Production dependency audit | 0 advisories |

No disposable PostgreSQL service or browser fixture environment was available
for this run, so the 168 integration tests and four Playwright scenarios were
not rerun. Their most recent recorded results remain in the 21 September audit.

## Remaining rollout blockers

These are not missing application features, but they prevent a responsible live
launch:

- verify separate development and production Supabase databases, auth projects
  and R2 buckets/credentials;
- review and apply all pending forward migrations with the documented writer
  handover and preflight checks;
- configure test Paystack keys, exact callback/account/site URLs and the signed
  webhook in the isolated development environment;
- configure SES, a confirmed safe test recipient, the protected scheduler and
  `NUXT_CUSTOMER_NOTIFICATIONS_ENABLED=true`;
- deploy matching public and admin revisions so an old frontend cannot talk to
  a new checkout contract (or the reverse);
- manually create two real programme volumes, upload real private PDFs, buy both
  in one Paystack test transaction, receive the SES link, sign in and download
  both files;
- exercise duplicate submissions, closed-browser settlement, pending/failed
  payments, partial/full refunds, recovery and cross-customer denial;
- verify hosted CI, trusted proxy ingress, RLS, R2 permissions, scheduler alerts
  and billing/accounting policy before explicit live approval;
- perform an authorized low-value live smoke test only after all earlier gates
  pass, using isolated live resources and reconciliation procedures.

Use the ordered [development rollout checklist](../development-rollout-checklist.md)
to record non-secret evidence. The previous hosted-development observations are
historical until rechecked; the public development URLs were not accessible to
the review tool during this audit.
