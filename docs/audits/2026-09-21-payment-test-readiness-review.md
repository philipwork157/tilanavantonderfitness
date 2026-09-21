# Payment test-readiness review — 21 September 2026

Reviewed revision: `23aa25d`. This is a scoped source review and local verification, not a penetration test or production certification. No application changes, real payments, external emails, deployments, or production migrations were performed.

## Verdict

Ready for controlled **isolated test-mode acceptance testing**, subject to the environment checks below. **Not yet approved for live payments.** The additional evidence-validation gap below has now been fixed locally. Completion of the previous six remediation tasks does not replace deployed-environment verification.

## Fresh verification

| Check | Result |
| --- | --- |
| Admin unit tests | 266 passed across 35 files |
| Web unit tests | 75 passed across 6 files |
| Database migration consistency (`pnpm db:check`) | Passed |
| Disposable PostgreSQL integration tests | 166 passed |
| Local browser suite with provider/email fixtures | 4 passed |

Unit tests were run directly in each workspace, not inferred from cached task results. Integration and browser tests used the existing disposable local database harness. Browser coverage included two-volume checkout and customer sign-in, basket cross-tab changes and duplicate submission, pending payment behaviour, and HTTP origin/challenge rejection.

Type checks and production builds were not rerun in this review. These results do not verify actual Paystack delivery, SES deliverability, hosted CI, deployed ingress, production RLS/storage permissions, or the admin upload UI.

## REAUDIT-07 — Compare dispute transaction identity on every processing path

- [x] **P2: Require the dispute transaction ID to match the stored payment transaction ID before recording or applying a dispute.**

Original finding evidence (before remediation):

- `apps/admin/server/services/paystack.ts:896` derives the payment reference from the nested dispute transaction. Its payment lookup selects amount, currency, environment and status, but not `providerTransactionId`.
- `apps/admin/server/services/paystack-disputes.ts:7` likewise omits that ID from its payment type. The checks at lines 15–20 validate environment and money, but never compare transaction IDs.
- A resolved `merchant-accepted` dispute can consequently reach the reversal/order-refund updates and return `revoke: true` despite a contradictory transaction ID.
- `apps/admin/server/services/payment-recovery.ts` already checks this identity in provider-list recovery. The webhook/shared processing path needs equivalent protection, including admin replay.

A synthetic service probe supplied stored transaction ID `12345` and dispute transaction ID `999999`, with otherwise matching evidence. The mocked transaction recorded reversal/refund writes and the service returned `{ status: 'processed', revoke: true }`. This probe made **no database writes**; it demonstrates a missing service guard, not an unauthenticated exploit. Webhook signature and admin authorization requirements remain in place.

Impact: contradictory trusted-provider evidence could be attached to the wrong transaction and revoke access. A valid signature establishes the sender, but does not resolve inconsistent purchase identity. Paystack's [dispute API](https://paystack.com/docs/api/dispute/) includes transaction identity in dispute evidence.

Acceptance criteria:

- [x] Include stored `providerTransactionId` in the payment lookup and shared dispute input.
- [x] Reject or safely defer mismatched/missing identity before dispute, payment, order, or entitlement mutations; do not guess a missing ID.
- [x] Add webhook/shared-path and admin replay regression tests for matching reference/money but a different transaction ID.
- [x] Cover legitimate matching evidence and missing stored identity; verify mismatch leaves financial and access state unchanged.

Remediation: shared processing now rejects contradictory IDs before mutation. Pending payments without confirmed identity remain deferred; settled payments without identity fail for review. Admin replay uses the same guard. Four unit regressions cover missing/mismatched identity, including pending evidence. Two PostgreSQL regressions cover event processing and replay, unchanged financial/access state on rejection, and successful deferred replay after matching charge confirmation. No schema migration is required.

Remediation verification: `pnpm test` passed (270 admin tests freshly run; 75 unchanged web tests cached), `pnpm check` and `pnpm build:admin` passed, and all 168 disposable PostgreSQL integration tests passed. The browser suite was not rerun for this server-only change. No external payments, emails, deployment, or commit was performed.

## Before isolated test-mode acceptance testing

- [ ] Apply the latest reviewed migrations to the isolated development database. Follow [payment evidence upgrade guidance](../payment-evidence-upgrade.md) where applicable; do not treat a local migration check as proof of deployment.
- [ ] Verify test Paystack credentials, exact public/callback URLs, and separate development Supabase/storage resources.
- [ ] Configure SES and safe customer-access/invoice development recipients. Confirm the intended recipient override rather than sending test mail to real customers.
- [ ] Verify the recovery scheduler is actually running with its protected token and intended billing/customer-notification flags; inspect failures and backlogs.

## Manual acceptance evidence still required

- [ ] Admin creates a programme/volume, uploads its private file, publishes it, and confirms catalogue visibility.
- [ ] Customer purchases two programmes in Paystack test mode; admin sees the correct customer, order items, payment and invoice.
- [ ] Payment completes after the customer closes the browser; webhook/recovery still fulfils the order exactly once.
- [ ] The real SES email arrives, the passwordless link signs in the correct customer, and both purchased downloads work; another customer's private file remains inaccessible.
- [ ] Repeat-email purchases, retries and duplicate clicks retain the correct ownership without duplicate charges or grants.
- [ ] Exercise failed/pending payments, partial/full refunds, duplicate/out-of-order events and recovery, checking resulting money and access state.

## Before live approval

- [x] Resolve REAUDIT-07 and rerun relevant regression checks.
- [ ] Record successful current CI/type checks and production builds.
- [ ] Verify deployed ingress/proxy trust, RLS, private storage permissions, secrets and strict test/live separation.
- [ ] Record scheduler/alert operation and completed manual acceptance results above.
- [ ] Obtain explicit launch approval and perform an authorized low-value live smoke test with reconciliation and cleanup procedures.

Earlier findings remain recorded in the [20 September remediation review](./2026-09-20-paystack-remediation-review.md). No other new defect was confirmed in this scoped review; that is not a claim that no other defect exists.

Remaining count: **0 open code findings in this review; 14 unchecked readiness checklist items** (4 environment preparation, 6 manual acceptance, 4 live-approval gates). These overlap historical launch checklists and are not 14 additional confirmed software defects. Hosted CI remains unverified even when local checks pass.
