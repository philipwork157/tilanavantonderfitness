# V1 checkout fixes

Verification record for the focused V1 checkout on `dev`. Earlier hardening was
committed as `5329b1d`; this record also covers the subsequent V1 follow-up.
No deployment or live migration was made. Tests used disposable databases and simulated
providers. No real payment, refund or test email was initiated manually.

## Verification results

- 488 unit tests passed (379 admin and 109 public website).
- 210 integration tests passed against a fresh disposable PostgreSQL database.
- Five real browser scenarios passed against local Paystack, R2, Supabase and
  SES fixtures, including the automatic two-PDF purchase email and separate
  one-time recovery email, failed payment with no email/access, pending payment
  recheck, HTTP security, and administrator sign-in/sale visibility/Nourish PDF
  replacement followed by a new purchase email containing the new bytes.
- `pnpm check`, `pnpm db:check`, both fresh production builds and
  `git diff --check` passed. One additive edition-snapshot migration is included;
  it was applied only to disposable fixture databases.
- The earlier production dependency audit reported three upstream
  high-severity warnings described below. They were not remediated by this
  V1-only follow-up; application tests are not a substitute.

## Implemented safeguards

- Upload finalization reads the ETag-matched private object and parses the PDF
  before making it ready. Password-protected, pageless or corrupt PDFs fail.
- The default upload creates the latest edition of the selected volume,
  activating it and retiring older active files atomically. History and R2
  objects remain. Different volumes remain separate products. Concurrent
  reservations serialize, and older uploads cannot supersede newer ready files.
- Before first Paystack initialization, checkout checks notifications/retries,
  safe test/live email routing, resolvable AWS credentials and the complete
  readable private PDF payload. Failed preflight never contacts Paystack or
  grants content. Known oversized baskets fail before payment.
- Purchase email assembly validates the PDFs again. Paid orders retain durable
  retries on storage or SES failure. Completion shows email delivery separately
  from payment status; an email outage never pretends a paid order failed.
- New orders pin the exact validated PDF editions, sizes and content digests
  before Paystack is called. Later replacement cannot remove their attachments.
  Historical editions remain; the portal still uses the latest active PDFs.
- Publication and published replacement uploads share the 15 MiB/30-file email
  budget. Unknown sizes fail closed. Rejected replacement leaves the existing
  published PDF available, including during concurrent publication changes.
- Failed/abandoned completion shows "Sorry, something went wrong", retains the
  basket and sends no programs. Pending/unknown status warns against another
  payment and offers "Check payment again". Browser storage errors cannot hide
  verified payment truth or invite an unsafe new attempt.
- The clients page defaults to settled Paystack payments in the configured
  environment. Manual and pending records remain under the explicit all-clients
  view. Existing Paystack refund controls are retained.
- Each sale shows the existing purchase outbox's queued, retrying or SES-accepted
  status. Dashboard alerts include missing, retrying and overdue purchase emails.
  These read-only indicators never change recorded financial history.
- Local retries are opt-in and development-only. Fly uses the existing external
  recovery scheduler. Missing GitHub scheduler tokens now fail visibly.
- Recovery does not repeatedly verify known locally rejected/unsubmitted
  references. Uncertain/submitted payments still reconcile; newly seeded due
  jobs run in the same scheduler invocation. Optional billing failures cannot
  block the independent payment and customer-email workers.
- Public-program navigation uses the configured local/dev/live website origin.

## Remaining launch checks

1. Review/apply
   [the additive migration](../supabase/migrations/20261003181008_pin_purchase_pdf_editions.sql)
   to the intended database before deploying this backend. It preserves existing
   records and adds immutable, ownership-linked purchased-PDF snapshots. It does
   not backfill old purchases. Repair old active PDFs with missing size metadata
   through the admin replacement upload before selling them.
2. Restart local development after setting
   `NUXT_LOCAL_CUSTOMER_NOTIFICATIONS_WORKER_ENABLED=true`.
3. On each deployed environment configure notifications, the recovery switch,
   dedicated token and alert address, and its matching GitHub scheduler secret.
   Verify workflow invocations and independently monitor the email backlog.
   See [delivery setup](./customer-access-delivery.md).
4. Verify actual private R2 reads, SES send authorization, inbox receipt and a
   Paystack test purchase/refund in the deployed isolated test environment.
   Mocked tests cannot certify provider availability or production setup.
5. Review the three high-severity production dependency advisories below.
   On 3 October 2026 the registry still offered node-forge 1.4.0,
   http-cache-semantics 4.2.0 and braces 3.0.3 as latest releases. The audit
   advertises higher patched ranges, but those versions were not installable.
   No advisory was suppressed and no unreviewed cryptographic/vendor patch was
   invented. This remains a release risk, not a completed dependency fix.

   - [node-forge signature verification](https://github.com/advisories/GHSA-86w9-cpqp-85rv)
   - [http-cache-semantics shared-cache disclosure](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)
   - [braces nested-pattern denial of service](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)

## What the email queue is

`customer_notifications` is an existing PostgreSQL outbox table, not a new
email provider. Each row records the purchase/login job, linked customer/order,
attempts, next retry time, lease and sent/canceled markers. PDF bytes stay in
private R2. Magic links are generated during login delivery and are never stored
in this table. Failed unsent rows remain retryable; `sent_at` records SES
acceptance, not inbox receipt. No queue rows or customer data were deleted.
