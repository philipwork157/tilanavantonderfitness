# Development rollout and acceptance checklist

Owner: project operator. Created 21 September 2026. This checklist records work still required outside local code verification. Do not mark a step complete without evidence from the intended environment. Do not enable live payments as part of this checklist.

The 11 steps below consolidate the overlapping 14 readiness items in the [audit](./audits/2026-09-21-payment-test-readiness-review.md); they are not additional software defects.

## Ordered checklist

- [ ] **1. Confirm resource isolation.** Verify that development has its own database/Supabase project and R2 buckets/credentials, separate from production. Record resource names, not secrets. Never relabel test payments as live.
- [ ] **2. Review and apply pending migrations safely.** Confirm the target database, backups and current migration state. Follow [deployment](./deployment.md), [payment evidence upgrade](./payment-evidence-upgrade.md) and their linked rollout instructions. Pause affected writers for migration/application handover; do not blindly run migrations against an unknown target.
- [ ] **3. Configure development Paystack.** Set `NUXT_PAYSTACK_ENVIRONMENT=test`, an `sk_test_...` secret, `NUXT_PAYSTACK_CALLBACK_URL=https://website-dev.tilanavantonder.co.za/checkout/complete`, `NUXT_ACCOUNT_BASE_URL=https://admin-dev.tilanavantonder.co.za` and the matching `NUXT_PUBLIC_SITE_URL`. Configure the test dashboard webhook as `https://admin-dev.tilanavantonder.co.za/api/webhooks/paystack`. Keep checkout unavailable until both applications and the database are ready.
- [ ] **4. Configure development private storage.** Set the R2 configuration listed in [deployment](./deployment.md). Use `tilanavantonder-dev-public-media` and `tilanavantonder-dev-private-programs`, with separate read-only download and read/write upload credentials. Verify actual permissions and object existence, not just bucket names.
- [ ] **5. Configure and verify SES test delivery.** Verify AWS credentials, region and sender. Confirm the safe inbox with its owner, then set both `NUXT_CUSTOMER_ACCESS_DEVELOPMENT_RECIPIENT` and `NUXT_INVOICE_DEVELOPMENT_RECIPIENT`. Check delivery restrictions and actual receipt. Supabase generates authentication tokens; project email templates are delivered through SES, not Supabase SMTP.
- [ ] **6. Activate and monitor background processing.** Configure `NUXT_PAYSTACK_RECOVERY_ENABLED`, a dedicated `NUXT_PAYSTACK_RECOVERY_TOKEN`, `NUXT_PAYSTACK_RECOVERY_ALERT_TO`, `NUXT_CUSTOMER_NOTIFICATIONS_ENABLED` and `NUXT_INVOICE_BILLING_ENABLED`. Set the matching GitHub `PAYSTACK_RECOVERY_TOKEN_DEV`. Follow [recovery](./paystack-recovery.md), [customer delivery](./customer-access-delivery.md) and [billing](./billing.md). Verify successful scheduled runs, alerts and backlogs. A workflow file alone does not prove the scheduler is active.
- [ ] **7. Deploy matching current application versions.** Build/deploy public Astro and admin Nuxt to development only, with the correct public build-time endpoints and Turnstile key. Verify deployed commit identity and basket UI. Avoid a mixed-version payment window. See [deployment](./deployment.md) for GitHub configuration and ingress requirements.
- [ ] **8. Prepare two real test catalogue items.** In admin, create or verify two published programme volumes, prices and ready private PDFs. Verify both appear in the public catalogue. Do not use fake file metadata as proof of delivery.
- [ ] **9. Exercise the complete purchase.** Buy both in one Paystack test transaction; confirm one order with two immutable items, payment settlement, both access grants and invoice. Receive actual SES mail, sign in using the purchase address, and download both PDFs. Confirm the admin customer/purchase view agrees with the order.
- [ ] **10. Exercise adverse cases.** Test repeat-email purchases, duplicate submissions, closing the browser before confirmation, pending/failed payments, duplicate/reordered events, partial/full refunds and recovery. Verify other customers cannot access the files or invoice documents. Confirm a second independent valid grant survives another order's refund.
- [ ] **11. Record acceptance and review live readiness separately.** Attach dated evidence and deployment revisions to the audit. Verify hosted CI, private storage/RLS/ingress boundaries, monitoring and the billing/accounting review. Obtain explicit production approval before a separately authorized low-value live smoke test. Passing local tests is not live approval.

## Evidence log

For each completed step record:

| Step | Date | Environment/revision | Non-secret evidence | Result / remaining issue |
| --- | --- | --- | --- | --- |
| | | | | |

Never paste credentials, session cookies, magic links, signed download URLs or unnecessary customer details into this document. Retain test financial history; do not delete or rewrite it to make checks pass.

## Previously observed blockers

At the 21 September preflight, the hosted backend reported revision `a714e2a` and the public development site still displayed the old single-programme purchase UI. Fly's listed development secrets lacked the payment/storage/worker settings. Those are historical observations, not a new live check. Recheck after deployment. See the [audit follow-up](./audits/2026-09-21-payment-test-readiness-review.md#development-preflight-follow-up--21-september-2026).
