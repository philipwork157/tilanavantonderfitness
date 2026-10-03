# Paystack recovery and dispute operations (PAY-05)

Implemented locally. Not deployed or enabled by this task. Live payments remain
blocked by the production-readiness audit and its separate launch checklist.

## What runs without the browser

The external `Reconcile Paystack payments` GitHub Actions workflow sends a
protected POST every ten minutes to each explicitly configured environment.
It can wake a sleeping Fly machine; an in-process timer cannot. GitHub schedules
run only from the repository's default branch, may be delayed, and are not a
hard availability SLA. Enable workflow failure notifications and establish an
independent heartbeat/backlog monitor before live launch. For stronger timing
guarantees, use a monitored external scheduler calling the same protected route.

`POST /api/internal/payments/reconcile` requires a dedicated bearer capability,
not an administrator cookie or the Paystack secret. It accepts no financial
payload and performs no charge/refund initialization. It:

1. Checks the key/mode/deployment/database boundary from PAY-04.
2. Seeds up to 100 unqueued Paystack payments older than two minutes.
3. Claims persisted `payment_recovery_jobs` using `FOR UPDATE SKIP LOCKED`.
   A ten-minute lease and incrementing lease version coordinate machines;
   expired leases are recoverable after a crash. Provider calls run outside locks.
4. Processes up to 20 jobs, stopping new claims after 150 seconds. Pending
   payments and unresolved refunds take priority over periodic settled checks.
5. Verifies the reference, environment, amount and currency with Paystack.
   Closed-browser success uses the same atomic fulfillment path as webhooks.
6. For settled payments, reads transaction-filtered refund/dispute lists,
   validating ownership for every result. Pagination is bounded to three pages
   of 100 records per list. All list pages/ownership are validated before
   applying list evidence. Overflow or malformed evidence requires retry/review,
   never a guessed absence of a refund or an invented second reservation.
7. Replays prerequisite-dependent events and applies provider list evidence
   through the idempotent webhook transaction paths.
8. Reschedules successful checks for six hours later. Failures retry indefinitely
   with exponential backoff from one minute to six hours. After eight failures,
   an operator alert is queued. Financial uncertainty is never discarded.

The six-hour interval is a target, not a guaranteed completion time. Monitor
overdue jobs, oldest pending payments and open dispute deadlines. Scale the
external invocation frequency/concurrency to the actual payment history and
provider rate limits; leases and the event ledger protect overlapping runs.
HTTP timeouts may occur while a handler finishes work; do not force a new
charge/refund, and let the durable lease/queue recover.

## Refunds delivered before charges

A valid refund for a known pending payment stays `received` in `payment_events`
with an awaiting-fulfillment summary. It is not permanently rejected. Repeated
delivery under that key can resume it. The recovery worker verifies the charge
and then retries stored deferred evidence. Permanent identity/evidence conflicts
stay `failed`, raise an operator alert when the payment is known, and remain
available for controlled replay after investigation.

An uncertain refund stays reserved even if the provider list is empty. Absence
is not evidence that the original API call failed. Review Paystack or wait for
valid later evidence; recovery never submits another refund request.

## Dispute policy

`payment_disputes` records the provider dispute ID, payment link, status,
resolution and stated disputed/refund amount separately from ordinary refunds.

- Create/reminder/open status: retain access and alert the operator. Submit
  evidence in Paystack before the provider deadline. An opened dispute is not
  completed financial loss.
- Resolved `merchant-accepted`: mark the payment reversed, mark the order's
  commercial state refunded, and revoke this order's purchase access. Even a
  partial accepted dispute revokes the whole disputed digital order; independent
  valid paid purchases still retain their own entitlement. This is a conservative
  access policy, not automatic allocation of a disputed amount across programs.
- Declined/unknown outcomes: retain existing access unless transaction
  verification confirms reversal. Alert for human review; a merchant declining
  a dispute is not proof of a bank decision in the merchant's favour. A later
  accepted resolution is still processed. Older open events cannot undo a
  resolved adverse outcome.
- A verified reversal of a previously successful payment also revokes access.
  Later success/refund events cannot restore a reversed payment's access.

Dispute debits are not inserted as refund reservations. Ordinary processed
refund totals remain distinct when handling accepted disputes; their amount
and outcome are auditable in the dispute/event records. Existing transaction
verification's reversal normalization still reports the full reversal through
the payment's refunded amount. This does not issue a legal invoice/credit note
or calculate net settlement; BILL-01 remains open.

Provider evidence and policy references:
[webhooks](https://paystack.com/docs/payments/webhooks/),
[refund API](https://paystack.com/docs/api/refund/), and
[dispute API](https://paystack.com/docs/api/dispute/).

## Protected administrator operations

The API documentation includes these cookie-authenticated administrator routes:

- `GET /api/admin/payments/recovery`: up to 100 queue summaries and 100 latest
  failed/deferred events, without raw customer/provider payloads. Historical
  failed rows remain audit evidence even when a later replay succeeds.
- `POST /api/admin/payments/recovery` with
  `{"action":"reconcile","paymentId":123}`: enqueue fresh provider reads.
- The same POST with `{"action":"replay","eventId":456}`: replay only a
  failed/deferred stored Paystack event. The server reads the original payload;
  the request cannot supply or alter financial evidence. A new replay ledger
  key contains the acting administrator and original event ID. The original
  row remains intact. Replaying processed evidence is rejected.
- The same POST with `{"action":"acknowledge","paymentId":123}`: clear the
  operator review flag after investigation and append an internal audit record
  with the acting administrator and prior reason. This does not change money,
  access, retry counters or the periodic schedule. Unresolved problems can alert
  again. Active leases cannot be stolen by enqueue/acknowledge requests.

All administrator mutations enforce same-origin and admin-role checks. None
offers a force-paid/force-refunded switch. Correct the provider-side problem or
submit evidence in Paystack, then enqueue/replay valid evidence. Do not edit the
database to force a financial outcome.

## Alerts and activation checklist

Recovery actor attribution now survives payload expiry in an integer user FK.
See [recovery audit retention](./recovery-audit-retention.md) for immutable
metadata, unresolved legacy exceptions and the required coordinated rollout.

Alerts contain internal payment IDs and generic summaries, not customer emails,
magic links, keys, card details or raw provider errors. Delivery is at-least-once:
SES failure/ten-second timeout keeps the alert pending. The scheduler receives
HTTP 503 for delivery failures, so workflow notifications provide a second
signal. A timed-out send may eventually arrive; duplicate operator emails are
possible and do not duplicate financial operations.

- [ ] Review and apply `20260917151828_bored_sebastian_shaw.sql` to the intended
  isolated environment before deploying this code. It adds two integer-keyed,
  RLS-enabled tables, restrictive foreign keys, counters and unique indexes.
- [ ] Configure matching Fly secrets: `NUXT_PAYSTACK_RECOVERY_ENABLED=true`,
  `NUXT_PAYSTACK_RECOVERY_TOKEN` (a distinct random token of at least 32 characters),
  and `NUXT_PAYSTACK_RECOVERY_ALERT_TO` (approved operator mailbox), plus SES.
- [ ] Configure the matching GitHub repository secret
  `PAYSTACK_RECOVERY_TOKEN_DEV` or `PAYSTACK_RECOVERY_TOKEN_PROD`. Never reuse
  one environment's token in the other. An unset token now fails that workflow
  target visibly instead of silently claiming success. The server defaults to
  recovery disabled; deployed V1 checkout requires recovery configuration before
  opening new payments. Never put tokens in URLs.
- [ ] Confirm the workflow is on the default branch and manually dispatch a
  test-environment run. Dev requires test keys; prod requires reviewed live
  configuration and an isolated live database. Do not enable prod prematurely.
- [ ] Test real provider payload shapes, sleeping-machine wake-up, missed
  webhook recovery, SES delivery/retry, and workflow failure notifications.
- [ ] Establish scheduler heartbeat/backlog monitoring and a dispute owner.
- [ ] Keep all production-readiness launch gates separate from passing local tests.

No deployed migration, secrets, workflow activation, real provider request or
email was performed in the local implementation. Automated regression tests
use disposable PostgreSQL with mocked Paystack/Supabase/SES transports.
