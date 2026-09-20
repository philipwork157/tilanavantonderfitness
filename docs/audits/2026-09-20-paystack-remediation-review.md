# Paystack remediation review — 20 September 2026

Reviewed revision: `b737ed0a1c706888ba48f400895dbe1b72b38278`.

Scope: follow-up code review of the basket, checkout, customer access, payment
recovery, billing/database safeguards, security remediation, and test gates.
This report tracks review findings and subsequent remediation; it does not
certify the deployed environment.

## Outcome

The [original audit](./2026-09-17-paystack-production-readiness.md) has all 17
implementation findings checked, but its launch-validation checklist is still
open. Checked implementation tasks are not equivalent to production readiness.
This review initially found six remaining gaps. TEST-01 was only partially delivered
against its original browser-test requirement; SEC-01 and SEC-02 also need
follow-up. The settled-snapshot boundary below carries forward an existing
launch-validation concern rather than discovering a public authorization bypass.

Existing safeguards include signed-provider payment processing, financial
integration tests in CI, shared abuse controls, event minimization, and issued
invoice protections. These are useful controls, but do not close the findings
below. No claim is made that an unauthenticated attacker can alter the ledger.

## Fix checklist

Priority P1 means resolve before production sign-off; P2 means a concrete
correctness/security-hardening issue to resolve before calling this audit closed.

- [x] REAUDIT-01 — P1: enforce settled purchase snapshots independently of invoice creation.
- [x] REAUDIT-02 — P1: complete browser checkout/access tests and gate CI on them.
- [ ] REAUDIT-03 — P2: make the documented local request-identity configuration work.
- [ ] REAUDIT-04 — P2: retain the administrator identity for recovery audit actions.
- [ ] REAUDIT-05 — P2: validate evidence field types and bound retained values.
- [ ] REAUDIT-06 — P2: cover malformed historical payloads in the SEC-02 upgrade path.

## Remediation completed — 20 September 2026

REAUDIT-01 and REAUDIT-02 are implemented and verified locally. The finding
descriptions below preserve the original review evidence; REAUDIT-03–06 remain open.

- **REAUDIT-01:** the new forward migration protects settled order, line and
  payment snapshots independently of invoices, locks both endpoints of line
  moves, and checks aggregate/amount/currency consistency at settlement.
  Manual purchases create their lines before settlement. Regression tests cover
  absent, draft and issued invoices plus concurrency and legitimate lifecycle
  transitions. See [protection and rollout](../settled-purchase-protection.md).
- **REAUDIT-02:** four served Astro/Nuxt Playwright scenarios use disposable
  PostgreSQL and controlled external providers/email. They cover two-volume
  checkout, retries/duplicate submit, cross-tab baskets, success/failure/pending
  returns, email-link login and private-file authorization. The suite also found
  and fixed native browser fetch binding and request-local Supabase session
  reuse bugs. The reusable quality/deployment gate now runs the browser suite.
  See [browser test instructions](../browser-checkout-tests.md).
- **Verification:** `pnpm check`, `pnpm db:check`, 317 unit tests, 155 PostgreSQL
  integration tests, four Chromium browser scenarios, and both application
  production builds passed. Frozen-lockfile installation also passed.
- **Not performed:** deployed migration, hosted CI execution, real provider
  transaction, live email delivery or production security/configuration checks.
  The launch checklist remains open; apply the reviewed migration with the
  documented writer handover before relying on the new database guarantees.

### REAUDIT-01: paid purchase snapshots depend on later billing

Evidence: `protect_managed_order`, `protect_managed_order_item`, and
`protect_managed_payment` in
[`20260918054905_steady_quasar.sql`](../../supabase/migrations/20260918054905_steady_quasar.sql),
and the opt-in worker in
[`invoice-worker.ts`](../../apps/admin/server/services/invoice-worker.ts).

The order guard requires a managed invoice to exist; the order-line guard
requires a non-draft managed invoice. The payment snapshot guard targets manual
payments attached to managed invoices. A paid Paystack purchase awaiting invoice
creation therefore does not get equivalent settled-snapshot protection from
these triggers. The billing worker can also be disabled or fail independently.

Impact: privileged application writes or future code mistakes can change paid,
unbilled purchase descriptions/amounts. Existing row-level arithmetic checks do
not establish the complete aggregate order-line/payment relationship. This is a
database integrity gap, not evidence of public write access.

Required fix: add forward migrations protecting settled purchase identity,
money/currency, and line snapshots based on payment/settlement state, not merely
invoice presence. Define aggregate line/order/payment consistency at settlement.
Preserve legitimate refund and recovery transitions rather than freezing every
column indiscriminately.

Acceptance: database tests reject snapshot changes and line insert/delete/moves
for paid purchases with no invoice, with a draft invoice, and after issuance.
Verify both source and destination when moving a line. Reject mismatched totals
or currency at settlement; legitimate refunds/recovery must still pass.

### REAUDIT-02: TEST-01 still lacks browser coverage

Evidence: [quality workflow](../../.github/workflows/quality.yml) and
[web Vitest configuration](../../apps/web/vitest.config.ts).

CI runs checks, unit/client-helper tests, and PostgreSQL integration tests. The
frontend tests use the Node environment, not an actual browser. No browser E2E
configuration/suite was found. Directly invoked route tests and extracted helper
tests cannot verify rendered forms, Astro event binding, navigation, cross-tab
basket behaviour, or real HTTP cookie/session handling together.

Required fix: add a served-app browser suite with controlled provider/email
fixtures and a disposable database. Keep real provider smoke tests separate from
deterministic CI. Add the browser suite as a required quality/deployment gate.

Acceptance: cover two-volume purchase, duplicate submit/retry, basket changes,
payment return and basket clearing, failed/pending payment, email-link sign-in,
and unauthorized private downloads. Exercise the actual UI and HTTP boundary,
not only mocked helper functions. Record the original TEST-01 browser requirement
as incomplete until this passes.

### REAUDIT-03: copying the example environment breaks local public requests

Evidence: [`apps/admin/.env.example`](../../apps/admin/.env.example),
[`nuxt.config.ts`](../../apps/admin/nuxt.config.ts), and
[`request-identity.ts`](../../apps/admin/server/utils/request-identity.ts).

The example sets `NUXT_TRUSTED_CLIENT_IP_HEADER=fly-client-ip`, overriding the
empty development default. Ordinary direct local requests have no such header.
`getTrustedRequestIp` then rejects them instead of using the socket address.

Reproduced with a pure-function probe: configure `fly-client-ip`, return no
header, and supply socket IP `127.0.0.1`. Result: HTTP 403, `Trusted request
identity is unavailable.` Routes using this helper can fail before checkout,
contact, or login processing.

Required fix: separate local and trusted-production-proxy configuration. Keep
the local example compatible with direct development requests; document the
production ingress requirement. Do not fix this by trusting arbitrary forwarded
headers or silently weakening production identity checks.

Acceptance: a test using the documented local setup succeeds without proxy
headers; production missing/invalid trusted identity still fails closed. Verify
the actual production ingress separately.

### REAUDIT-04: payload expiry removes recovery-action attribution

Evidence: `requestPaymentRecovery` and `redactExpiredPaymentEventPayloads` in
[`payment-recovery.ts`](../../apps/admin/server/services/payment-recovery.ts).

Administrator recovery actions create internal events whose payload contains
`administratorUserId` and `previousReviewReason`, with the same 30-day expiry as
provider evidence. The redaction query covers processed/ignored events without
restricting the provider. It replaces this payload with `{ redacted: true }`.
The remaining random event key and digest do not identify the administrator.

Impact: once the cleanup runs after expiry, the financial operations audit trail
loses who acknowledged or requeued recovery. This is not a reason to retain all
raw provider payloads indefinitely.

Required fix: separate internal audit metadata from short-lived provider replay
data. Preserve the actor in a durable, appropriately protected integer identity
relationship and define the internal audit retention policy. Account for existing
internal events before they expire.

Acceptance: advance time beyond 30 days and run cleanup; provider details are
redacted while recovery actions retain their actor/action/target attribution.
Cover existing rows as well as newly created events.

### REAUDIT-05: the evidence allowlist copies arbitrary nested values

Evidence: `pick` and `sanitizePaystackEvent` in
[`paystack-event-evidence.ts`](../../apps/admin/server/utils/paystack-event-evidence.ts).

The allowlist filters keys but copies their values without validating scalar
types or length. An allowed field such as `gateway_response` can therefore retain
an entire nested object, including fields the sanitizer otherwise excludes.

Reproduced with synthetic input: put
`{ authorization_code: 'SYNTHETIC_SECRET', customer: { email: 'fixture@example.test' } }`
under `data.gateway_response` in a `charge.success` event. Both nested fields
remain in the sanitized output. This is a malformed-input resilience issue:
webhook signature verification is still required and is not bypassed.

Required fix: use typed, bounded evidence schemas. Accept only expected scalar
values at scalar keys, explicitly shape required nested structures, and omit
unneeded free text. Retain a safe failure classification/digest when evidence is
invalid without persisting the rejected object wholesale. Review legacy cleanup
for the same shallow-copy behaviour.

Acceptance: nested objects/arrays in scalar fields, oversized values, and
sensitive unexpected fields are not retained. Valid deferred refunds/disputes
must still replay successfully after sanitization.

### REAUDIT-06: historical non-object `data` can block the retention migration

Evidence: charge/refund branches in
[`20260919135337_shallow_flatman.sql`](../../supabase/migrations/20260919135337_shallow_flatman.sql),
and the empty-database setup in
[`paystack-database.ts`](../../apps/admin/tests/helpers/paystack-database.ts).

The migration calls `jsonb_each(coalesce(payload->'data', '{}'::jsonb))`.
`coalesce` handles an absent key/SQL NULL, not JSON `null`, an array, or a scalar.
Those values are not objects suitable for `jsonb_each`. If a historical
charge/refund row contains one, the upgrade can fail. Whether deployed databases
contain such rows was not checked; this finding is based on SQL inspection, not
a reproduced production migration failure.

The current integration harness migrates an empty database before inserting
fixtures, so passing that suite does not test this populated-upgrade case.

Required fix: preflight historical shapes and provide a reviewed safe upgrade
path using object-type checks. Respect deployed migration history: do not simply
rewrite an already-applied migration. For a database blocked before this
migration, document a safe preparatory repair because a later migration alone
cannot fix a migration it cannot reach. Coordinate rollout of the new non-null
digest column with application writers.

Acceptance: upgrade a disposable preceding-version database containing valid,
missing, JSON-null, array, and scalar `data`, plus deferred and internal events.
Verify no upgrade failure, preserved necessary replay/audit metadata, and correct
redaction/digest behaviour.

## Verification performed for this review

- Fresh `pnpm --filter @tilana/admin test`: 33 files, 238 tests passed.
- Fresh `pnpm --filter @tilana/web test`: 6 files, 74 tests passed.
- `pnpm test` also succeeded, but used Turbo cache; the fresh runs above are the
  verification evidence for this review.
- Executed read-only synthetic probes for REAUDIT-03 and REAUDIT-05.
- Reviewed source, migration guards, workflow configuration, and the original
  audit against the findings above.

The PostgreSQL integration suite and production builds were **not rerun in this
review**. No deployed database, provider transaction, live email delivery, or
production ingress was inspected. Historical test results are not fresh evidence.
This is a scoped source review, not an exhaustive penetration test.

## Outstanding launch evidence

Keep the original audit's launch checklist open until its actual results are
recorded. In particular:

- [ ] Demonstrate a test-mode two-program purchase through the deployed UI,
  correct payment/order/invoice records, entitlements, and admin reporting.
- [ ] Demonstrate email delivery, sign-in after closing the browser, and denied
  access to another customer's private files.
- [ ] Demonstrate partial/full refunds, duplicate/reordered events, and recovery.
- [ ] Verify deployed migrations, RLS, settlement constraints, and environment isolation.
- [ ] Verify scheduler activation for recovery, billing/delivery retries, and
  evidence cleanup; an expiry timestamp alone does not execute cleanup.
- [ ] Complete the six fixes above, their regression tests, and an explicitly
  authorized live smoke test with recorded launch approval.

Treat stale prose in the original report (including its original invoice and
test-gap descriptions) as historical, not a current architecture summary. Use
this report for follow-up status and update each checkbox only after its fix and
verification are recorded.
