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

## Development preflight follow-up — 21 September 2026

**Blocked before purchase submission.** Read-only inspection found that the hosted development environment is not yet ready to exercise the current implementation:

- Local HEAD is `140cf14` (REAUDIT-07 committed). Fly development machine image metadata reports `a714e2a`, an ancestor 26 commits behind this checkout. The machines are configured to auto-start, so their stopped state alone is not a fault.
- The public development `/program/` page renders the older single-programme **Buy now** links, with no basket control. Its exact deployed revision was not determined.
- `fly secrets list --app tilanavantonder-admin-dev` lists database, Supabase, AWS/SES sender, contact and newsletter settings, but no Paystack, R2, recovery, invoice-delivery or customer-notification settings. Inspected machine configuration only supplies general server settings and the development public site URL. Secret values were not retrieved; runtime credential validity remains unverified.
- The local admin `.env` has a test-mode Paystack key, localhost callbacks, development-named R2 buckets and a customer-access test recipient. Its recovery/customer-notification/billing enable flags, recovery token and invoice test recipient are unset. These local settings are not proof of hosted configuration or database/resource isolation.

No payment, email, remote database query/migration, deployment or configuration change was performed. No readiness checkbox was marked complete. Database migration state, resource isolation, scheduler operation and actual SES delivery remain unverified.

Next requires an authorized coordinated **development-only** rollout: verify resource identity and migration preflight, apply reviewed pending migrations with the documented writer handover, configure the matching test credentials/private storage/safe inbox and worker settings, and deploy both applications at the reviewed revision. Then repeat preflight before the two-programme test purchase. Confirm the intended inbox before sending test messages. Do not substitute a purchase on the old deployed application or enable production payments.

## Local public/admin code recheck — 21 September 2026

Reviewed checkout: `784823d`. The operator's ordered deployment tasks are now saved separately in [development rollout checklist](../development-rollout-checklist.md). No hosted configuration or application code was changed during this recheck.

### Scope and conclusion

No additional actionable defect was confirmed in this targeted review. The inspected purchase/access flow is coherent and suitable for isolated development acceptance testing, subject to the deployment prerequisites. This is not a guarantee of a bug-free system or a security certification.

- Public checkout: basket intent persistence, submission handling, server-priced volume eligibility and ready-file checks, serialized checkout reservations, and completion based on server status rather than the browser redirect.
- Payment boundaries: request origin/challenge/rate controls, raw-body webhook signatures, durable event processing and REAUDIT-07 identity validation.
- Admin: server-verified Supabase identity plus administrator role, same-origin mutation guards, programme upload/finalization/replacement services, and purchase invoice issuance from settled snapshots.
- Customer: verified email-to-client linking, customer-role/session checks, active entitlement/private-bucket checks on downloads, and invoice ownership checks independent of programme access.
- Automated regression coverage: refund/recovery, billing, settled-purchase constraints, programme delivery/entitlements, abuse controls and evidence-upgrade cases in the existing suites.

### Fresh verification

- `pnpm test --force`: 270 admin and 75 web unit tests passed, both freshly executed.
- Disposable PostgreSQL suite: 168 integration tests passed.
- Local browser suite: all 4 scenarios passed, using real local Astro/Nuxt HTTP and cookies with fixture provider/auth/email transports and disposable data. Scenarios cover two-volume checkout and sign-in, cross-tab/double-submit behaviour, pending payment, and origin/challenge rejection.
- `pnpm check` and `pnpm db:check` passed. An additional `pnpm exec turbo run lint typecheck build --filter=@tilana/admin --filter=@tilana/web --force` completed all 16 tasks successfully with zero cached tasks. Both production builds passed. Nuxt/Rollup emitted non-fatal generated-code annotation warnings; browser startup also emitted colour-environment warnings.

### Limits still requiring operator evidence

The browser suite does not exercise every admin screen or the real R2 upload interface. Admin coverage here is source/API/service/integration coverage, not a complete manual browser acceptance pass. Real Paystack, SES, Supabase authentication and R2 permissions/delivery, hosted migration state, deployment configuration, monitoring and billing/accounting approval remain unverified. No fresh dependency-vulnerability database scan or external penetration test was performed. Do not close the hosted readiness checkboxes based on these local results.
