# Customer access delivery (ACCESS-01)

## Customer flow

Signed Paystack success or server verification commits the paid order, program
entitlements and one `customer_notifications` purchase job together. A browser
return is not required. Payment is not rolled back by an email outage.

When enabled, fulfillment attempts a branded thank-you email after commit.
For new checkouts it attaches the exact ready PDF editions pinned before Paystack
initialization, using read-only R2 credentials and rechecking the paid order's
current purchase grants. Retiring an edition does not change this email. The
customer portal continues to offer the latest active edition. The
protected scheduler retries failures. Purchase emails also link to
`/account/sign-in`. This is not a bearer token and does not expire. The customer
uses their purchase email to request a one-time sign-in link. The public route
keeps its origin, rate-limit, validation, purchase eligibility and generic
response protections. Eligible requests queue a login job and attempt delivery
immediately. Failed sends stay queued for the scheduler.

Supabase generates a fresh token during each login delivery attempt. No token,
magic link or provider error is stored in the outbox or logged. Confirmation
still verifies Supabase identity, links integer users/clients and checks program
entitlements before private downloads. Login emails do not attach PDFs.

The attachment budget is 15 MiB of raw PDF data and 30 files, leaving room for
base64/MIME encoding. New V1 checkouts validate the complete PDF payload and
delivery/retry configuration before Paystack initialization. Known oversized
baskets are rejected before payment; individually oversized volumes are not
advertised as available. Publication and published replacement uploads enforce
the same complete-volume limits, including known positive file sizes. The
customer can request assistance or split a basket whose individual volumes fit.
Historical orders without edition pins retain the honest portal-only fallback
rather than receiving a partial set. New purchases never silently fall back to
an email without their attachments. Missing objects, changed pinned bytes, invalid PDFs,
storage failures and email failures remain queued. No public PDF URL is created.
Emailed copies cannot be recalled after refund or revocation.

## Reliability and limits

- One purchase key per order prevents duplicate jobs on webhook replay.
- Login requests coalesce in five-minute customer/time buckets. A sent bucket
  does not resend; wait for the next bucket to request another link.
- Workers claim up to five due jobs with `FOR UPDATE SKIP LOCKED`, ten-minute
  leases and versioned acknowledgements. Crashed leases become eligible again.
- Failure backoff starts at two minutes and caps at six hours. Eligibility is
  checked at delivery, and refunded/unpaid purchase jobs are canceled.
- Login requests expire after one hour; a canceled/expired request requires a
  new request. Supabase token generation is bounded to eight seconds and overall
  delivery attempts to thirty seconds, aborting storage/SES on timeout and
  preventing late token/storage results from initiating another send.
- SES acceptance is not proof of inbox receipt. Delivery is **at least once**:
  acceptance followed by a crash/timeout can produce a duplicate email on retry.
  In-flight accepted emails cannot be recalled after refunds. Retry generates a
  fresh sign-in token, which can supersede an earlier one. Never claim exactly-once
  delivery or permanent validity for a one-time token.
- This is not the shared distributed abuse-control work tracked in SEC-01.
  Fixed buckets supplement, not replace, those launch requirements.
- No automatic historical backfill: only success transactions after deployment
  queue purchase instructions. Legacy communications need an explicit review.

## Rollout and monitoring

1. Review/apply forward migrations `20260918061444_salty_bloodscream.sql` and
   `20260918061509_red_wendell_vaughn.sql` and
   `20261003181008_pin_purchase_pdf_editions.sql` to the intended isolated database
   **before** deploying this backend. Only disposable local databases were
   migrated during implementation.
2. Configure existing Supabase Admin Auth, SES credentials/sender and account
   origin. In test mode enable `NUXT_EMAIL_DEVELOPMENT_ENABLED=true`;
   `NUXT_EMAIL_DEVELOPMENT_RECIPIENT` must be a
   valid safe inbox. Live mode never redirects to it.
   After editing local `.env` values, fully restart with `pnpm dev:stop` followed
   by `pnpm dev`. An already-running Nuxt process can retain the previous inbox
   value; requesting a link again or hot-reloading code does not replace it.
3. Set `NUXT_CUSTOMER_NOTIFICATIONS_ENABLED=true` to activate immediate purchase
   delivery and scheduled retries.
   Default is false; new checkout now fails closed when it is disabled.
   Previously initialized payments still fulfill and queue jobs safely.
   Sign-in requests still attempt immediate delivery.
4. Locally, set `NUXT_LOCAL_CUSTOMER_NOTIFICATIONS_WORKER_ENABLED=true` and
   restart the development server. The local-only worker checks due purchase/login
   jobs once a minute, respects backoff/leases, skips overlapping runs and closes
   with Nitro. It never runs in a production build or on Fly.
   On deployed dev/live apps, activate the existing PAY-05 dedicated-token
   external scheduler with `NUXT_PAYSTACK_RECOVERY_ENABLED=true`, a distinct
   `NUXT_PAYSTACK_RECOVERY_TOKEN` of at least 32 characters and valid
   `NUXT_PAYSTACK_RECOVERY_ALERT_TO`. Set the matching GitHub repository secrets
   `PAYSTACK_RECOVERY_TOKEN_DEV` and `PAYSTACK_RECOVERY_TOKEN_PROD`.
   Deployed checkout requires these settings; it cannot verify that GitHub is
   actually invoking the endpoint, so verify scheduler runs and monitor backlog.
   The endpoint invokes
   access delivery independently of billing. No new cron service is installed.
   Configure workflow failure alerts: access failures return HTTP 503.
5. Independently monitor the queue and scheduler heartbeat. An absent scheduler
   cannot report its own absence. Use a privileged read-only operator query:

   ```sql
   SELECT kind, count(*) AS pending, min(created_at) AS oldest,
          max(attempts) AS highest_attempts
   FROM customer_notifications
   WHERE sent_at IS NULL AND canceled_at IS NULL
   GROUP BY kind;
   ```

   Alert on persistent backlog, old purchase jobs and repeated attempts. Inspect
   IDs and counters only; never expose queue reads anonymously. Fix configuration
   or transport failures before retrying. Do not edit sent markers to invent
   delivery evidence.
   Server logs classify failed attempts as `email-configuration`, `magic-link`,
   `timeout`, or `delivery`, with the notification ID/kind only. Raw provider
   errors, addresses, tokens and links are never logged. Invalid test-inbox
   configuration is checked before generating a token or reading attachments.
   The admin dashboard also counts purchase emails needing attention, and the
   sales list shows queued, retrying and SES-accepted status. A queued purchase
   older than thirty minutes is flagged; these indicators are read-only and do
   not alter payment history or claim mailbox receipt.
6. Verify actual closed-browser test checkout, safe-inbox SES receipt, link
   confirmation, repeat login, cross-customer denial and refund before go-live.
   Local tests mock every external provider and do not prove deployed setup.

## Pre-payment checks and customer status

Before the first provider initialization, checkout resolves AWS credentials
through the standard provider chain (without sending mail or requiring SES read
permissions), checks the safe recipient/mode and retry settings, and downloads
and parses the entire bounded PDF set using read-only R2 credentials. Conditional
ETag reads detect changed objects. PDFs must be readable, contain a page and not
be password-protected. A transaction then pins the validated editions, sizes
and SHA-256 digests in `order_item_files`, rechecking the catalogue under locks
so a concurrent replacement cannot switch the validated payload. A known failure
marks that uncharged reservation failed
and cancels its pending order; it never contacts Paystack or grants access.
Duplicate hosted URLs and already-settled checkouts retain their existing
idempotent behavior even if email configuration subsequently changes.

These checks are not an atomic transaction with SES or Paystack. A later outage
cannot undo a completed charge. The completion page reports payment separately
from email preparation, retry or SES acceptance and offers customer access.
`sent` means SES accepted the request, not proof that it reached the inbox.
Actual send authorization and mailbox receipt remain operational launch checks.

Known reservations that never reached Paystack are not treated as failed bank
transactions by recovery. Submitted or uncertain attempts still reconcile.
Recovery, optional billing and customer email workers run independently within
the existing protected scheduler, so an optional worker failure cannot prevent
purchase-email retries.
