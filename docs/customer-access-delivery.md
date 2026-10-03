# Customer access delivery (ACCESS-01)

## Customer flow

Signed Paystack success or server verification commits the paid order, program
entitlements and one `customer_notifications` purchase job together. A browser
return is not required. Payment is not rolled back by an email outage.

When enabled, fulfillment attempts a branded thank-you email after commit.
It attaches active, ready PDFs belonging to that paid order's current purchase
grants in the configured private bucket, using read-only R2 credentials. The
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
base64/MIME encoding. Oversized baskets receive an explicit portal-only email
instead of a misleading partial attachment set. Missing objects, invalid PDFs,
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
   `20260918061509_red_wendell_vaughn.sql` to the intended isolated database
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
   Default is false; fulfillment still queues purchase jobs and sign-in requests
   still attempt immediate delivery. Scheduler activation is necessary for
   recovering failed purchase/login emails, including crashes after fulfillment.
4. Activate the existing PAY-05 dedicated-token external scheduler. It invokes
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
6. Verify actual closed-browser test checkout, safe-inbox SES receipt, link
   confirmation, repeat login, cross-customer denial and refund before go-live.
   Local tests mock every external provider and do not prove deployed setup.
