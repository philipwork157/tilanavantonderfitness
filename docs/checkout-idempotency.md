# Checkout intent and retry behavior

Both `POST /api/checkout/paystack/basket` and the legacy single-volume
`POST /api/checkout/paystack` require `idempotencyKey`: an unpredictable UUID
formatted **external text token**, not an internal application ID. The server
stores its SHA-256 hash on the existing integer-keyed payment row.

## Customer flow

The Astro checkout hashes normalized customer details and the selected slugs
and displayed integer-cent prices. It persists an unpredictable key for that
fingerprint in browser storage. Retries, refreshed Turnstile tokens, item order
changes, and reloads reuse it. Email normalization ignores case and surrounding
space. Changed customer/basket details intentionally create a separate intent.
The browser stores hashes/tokens/references, not plaintext contact details.

Web Locks serialize storage changes across modern secure-context browser tabs.
Without that API, persistence protects sequential/same-tab retries but cannot
guarantee simultaneous first creation in different tabs. Clearing site storage,
changing devices, or manually supplying another key also creates a separate
intent. Idempotency is scoped to the same intent; entering the same email is
neither authentication nor a global prohibition on buying again. A full browser
checkout test remains part of the launch checklist.

Storage failures/corruption stop submission before the API call, rather than
silently issuing another key. After initialization, the reference is associated
with the key. Failed responses containing a validated reserved reference send
the buyer to that existing status screen. A successful, validated terminal
status response retires that browser key; a deliberate later purchase or retry
can use a fresh key. Confirmed paid completion also removes the submitted
basket items. Pending, invalid, and failed HTTP status responses never retire
the key. Refund status messaging remains tracked separately under WEB-03.

## Trusted server flow

1. The unchanged HTTP boundary still validates origin, request contract,
   honeypot, rate limits, and Turnstile on every request, including retries.
2. A short transaction takes an advisory lock for the key hash. A database
   unique index independently enforces `(provider, environment, key hash)`.
3. An existing key must have the same request fingerprint. A mismatch returns
   409 without initializing Paystack or creating another order. Existing
   reservations keep their purchased-price snapshots even after catalogue
   prices/publication change.
4. A new intent resolves published volumes/ready files and authoritative
   prices, then commits one pending order, its immutable items, and one payment
   with `provider_status = initialization_reserved`.
5. A conditional update claims that payment as `initializing` before network
   I/O. Only the winner calls Paystack, with a 10-second timeout and retries
   disabled. No database transaction/row lock is held during the provider call.
6. Complete provider evidence must contain the exact reference, nonempty
   access code, and an HTTPS URL on `checkout.paystack.com`. The saved URL is
   returned to retries. Concurrent callers wait for at most 12 seconds before
   receiving 409 with the same reserved reference.
7. A webhook may settle the payment during initialization. Conditional updates
   preserve that outcome; the customer returns to the existing completion
   screen. Settled/rejected keys do not initialize another payment.

Verification accepts only [documented provider transaction states](https://paystack.com/docs/payments/verify-payments/#transaction-statuses),
so provider evidence cannot reuse an internal initialization claim marker.

Paystack documents a [unique transaction reference](https://paystack.com/docs/api/transaction/#initialize).
The application additionally ensures only one initialization claim per intent.
The database hashes must be present as a pair and have SHA-256 format; legacy
payments may retain both null. No schema UUID or floating-point amounts are added.

## Uncertain results and operator review

An explicit successful HTTP response with provider `status: false` records
`initialization_rejected`, fails only a still-pending payment, and cancels only
its still-pending order. A timeout, HTTP error, malformed response, unsafe URL,
or mismatched reference remains `initialization_uncertain` with the order and
payment pending. A process crash after claiming may leave `initializing`; once
that claim is older than 15 seconds it is treated as uncertain on retry.

The same intent is never initialized again automatically. Retrying an uncertain
intent runs the existing bounded verification fallback for its stored reference.
Matching provider evidence may settle it atomically, and then returns its
completion screen. If still unresolved, 409 retains the reference and directs
the customer to confirmation/help. A provider pending response does not release
the claim or create another payable reference.

Operators must inspect the existing reference in the correct Paystack
environment. If charged, let validated verification or signed webhooks fulfill
it. If initialized but its URL was lost, review the provider record and customer
status before any deliberate new payment. There is no implemented automatic
URL recovery/new-attempt workflow or independent recovery worker; PAY-05
continues to track that work. Do not reset status hashes/claims or manually
invent a replacement reference to bypass uncertainty. Missing evidence requires
review, not an assumption that the provider rejected the charge.

## Verification and rollout

Run `pnpm test`, `pnpm check`, and both production builds. The opt-in PostgreSQL
suite in [test instructions](../apps/admin/tests/README.md) tests simultaneous
submissions, delayed initialization, lost responses, changed details, immutable
prices, rejection/uncertainty, crashes, verification recovery, webhook races,
deliberate later purchases, legacy checkout, and real uniqueness/hash constraints.
Provider calls are fixtures; no real charges occur.

Follow [deployment.md](./deployment.md) for migration-before-service and
coordinated frontend/backend rollout. The required field is a contract change:
keep checkout paused during mixed versions. Remaining recovery, browser,
environment, billing, email, and security requirements stay in the
[production audit](./audits/2026-09-17-paystack-production-readiness.md).
