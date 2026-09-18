# Purchase billing (BILL-01)

## Scope and seller

Implemented: prepaid, non-VAT invoices for new public Paystack program purchases.
The confirmed seller is Tilana van Tonder, a sole proprietor, at:

Ternberry Village, Cleveland 31  
Cape Town, Western Cape, 7580  
South Africa

The address is printed on private invoices, not added to the marketing site.
No VAT is charged; documents are titled `INVOICE`, not `TAX INVOICE`. This is
not a declaration that every legal/accounting obligation is satisfied. Review
requirements with the accountant. See [SARS registered-vendor tax invoice guidance](https://www.sars.gov.za/businesses-and-employers/my-business-and-tax/vat-connect-issue-20-october-2025/).

The broader BILL-01 finding stays open for controlled correction/reissue and
manual/coaching invoice authoring. Pre-existing manual invoice rows are
deliberately excluded from the new purchase history views.

## Linking and lifecycle

1. Checkout captures original buyer name, email and phone on `orders`, and
   purchased descriptions/amounts on `order_items`. Edited client profiles and
   live catalogue prices are not used to reconstruct these billing snapshots.
2. Signed webhook/verified provider evidence settles `payments` and the order,
   granting access through the existing payment service. Billing is separate:
   failure to issue/email an invoice cannot undo payment or fulfillment.
3. The opted-in billing worker shares the protected PAY-05 scheduler. It catches
   up at most 20 eligible orders per run. Ten minutes is the configured trigger
   interval, not a promised invoice/email deadline. Monitor backlog and age.
4. The service locks the order, requires exactly one settled Paystack attempt
   with `paid_at`, validates amount/currency/line totals, and atomically inserts
   invoice/item snapshots and an email outbox record. The invoice is issued/paid
   in that transaction; pending checkout attempts do not create invoices.
5. `invoices.settled_payment_id -> payments.id -> orders.id` records settlement.
   Failed/pending attempts are not allocations. Multiple settled attempts are
   flagged for operator allocation review, not silently summed or refunded.
6. A shared PostgreSQL sequence supplies `TVT-INV-########` and `TVT-CN-########`.
   Concurrent issuance is safe; gaps after rollback are intentional. Existing
   matching invoice numbers advance the initial sequence. Application IDs remain
   integers. Financial dates use `Africa/Johannesburg`.
7. Each processed refund creates one immutable `invoice_credits` row linked to
   its invoice, payment and exact `payment_refunds.id`. Pending, failed and
   uncertain refunds produce no credits. Replays cannot duplicate a credit.
8. A verified reversal credits only the remaining uncredited commercial balance.
   Later refund evidence stays in the payment ledger without double-crediting
   the sale. Open disputes produce no credits. Reversal credits are commercial
   adjustments, not claims that an ordinary refund was initiated. Fees, payouts
   and dispute cash movements still need accountant review.
9. Original invoices remain paid and retain their original totals; separate
   credit notes record partial/full adjustments and the purchase view shows
   credited amounts. Issued documents are never rewritten to hide history.

## Private PDFs and customer access

PDFs are generated from issued snapshots and streamed only after authentication
and ownership checks, with `private, no-store` and `nosniff`. There is no public
PDF URL, token-bearing email link or R2 write. Optional existing invoice R2
columns are not used. Noto Sans is bundled server-side with its license;
long text wraps and paginates. Unsupported glyphs fail instead of silently
corrupting names. Extend font coverage before accepting such billing text
(the bundled font does not cover every emoji/CJK character).

Emails link to `/account/invoices`. Customers use the existing passwordless
purchase-email sign-in flow; these links are not public downloads or automatic
authentication tokens. Invoice ownership uses the verified integer client ID,
not active program entitlement. Previously paid/refunded customers can request
another sign-in link. Orders reversed before any recorded payment do not qualify
as purchase history. This does not restore program access or implement ACCESS-01's
automatic post-payment program-access magic-link delivery.

## Durable delivery and operations

`invoice_deliveries` has one initial message per invoice and one per credit.
The worker claims up to five messages using `FOR UPDATE SKIP LOCKED`, ten-minute
versioned leases, ten-second delivery timeouts and exponential retry capped at
six hours. Expired leases recover after crashes. SES is at-least-once: a crash
after acceptance can duplicate an email, never the invoice or credit document.

The admin `/invoices` page shows purchase documents, credits, pending messages
and bounded issuance review jobs. All admin APIs require the admin role. Delivery
retry also checks same origin and expedites only unsent/unleased messages, without
recipient overrides or financial edits. Queued retries require the enabled
scheduler. Active/abandoned leases recover through scheduled processing.
Customer routes scope invoices to the verified `clients.id` and validate every
credit-to-invoice relationship; mismatched resources return 404.

`invoice_processing_jobs` records issuance failures with backoff so malformed
legacy purchases cannot indefinitely fill every batch. Review flags clear on
later successful reconciliation. Protected `/api/admin/invoices/operations`
returns at most 100 review and 100 unsent delivery records, without customer or
provider payloads. Scheduler HTTP 503 flags attempted billing failures; absence,
delay and overall backlog need independent monitoring.
Uncredited processed refunds and uncredited reversal balances also make an order
due for reconciliation, even if provider timestamps precede the invoice's last
check because a provider transaction waited for an order lock.

## Database safeguards

- RLS on all new tables; no anonymous policies.
- Unique purchase invoice/order, credit source/refund and delivery target.
- Composite invoice/order client FK, also fixing DB-01.
- Issued purchase invoices/items and all credit notes reject edits/deletion.
- Deferred validation requires complete paid invoices with consistent settlement
  and line totals at commit; no stranded issued invoice without lines.
- Credit triggers lock the invoice, validate refund/reversal ownership/evidence,
  and prevent credited totals exceeding the invoice.
- Delivery credit ownership and immutable targets are checked independently.

## Rollout checklist (not performed)

- [ ] Review/apply `20260917155837_polite_shockwave.sql` and
  `20260917155928_marvelous_iron_patriot.sql` in the intended isolated database.
  Review existing invoice/order client mismatches before adding the composite
  FK. Never silently change financial ownership to pass a migration.
- [ ] Review older purchases missing original buyer snapshots. They remain
  flagged for review rather than inventing historic details from current profiles.
- [ ] Deploy the backend capturing buyer snapshots on new checkouts.
- [ ] Set Fly runtime `NUXT_INVOICE_BILLING_ENABLED=true` to opt in.
- [ ] In test mode set `NUXT_INVOICE_DEVELOPMENT_RECIPIENT` to a safe inbox.
  Test delivery fails closed without it; live delivery ignores this redirect.
- [ ] Configure existing AWS SES region/credentials and verified sender.
- [ ] Activate the protected PAY-05 scheduler and matching environment token.
  No Fly cron migration is included; GitHub remains the existing trigger.
- [ ] Configure scheduler failure notifications and independent heartbeat,
  oldest-item-age and issuance/delivery backlog monitoring; review throughput.
- [ ] Validate actual SES delivery, a two-program isolated Paystack test purchase,
  partial/full refunds, reversal, downloaded contents and cross-customer denial.
- [ ] Define controlled correction/reissue and manual billing workflows with the
  accountant before calling the entire billing capability complete.

## Verification

Run `pnpm test`, `pnpm check`, `pnpm db:check`, `pnpm build:admin` and
`pnpm build:web`. Real PostgreSQL tests use the existing explicitly isolated
`PAYSTACK_TEST_DATABASE_URL` and `pnpm --filter @tilana/admin test:integration`.
Never supply an application/deployed database. Invoice cases share the Paystack
integration suite and actual migrations; provider/SES calls are local mocks.

Coverage includes concurrent two-volume issuance, replay, price/snapshot
preservation, missing snapshots/multiple settlements, partial/full credits and
reversal, immutability, cross-client FK/download denial, credit overage/ownership,
outbox associations, failed/concurrent email delivery, safe test/live routing,
route guards/contracts, scheduler failures, private PDF headers, embedded fonts,
wrapping/pagination and refunded-customer account access. A synthetic sample
invoice was rendered and visually inspected using the PDF skill. Browser/provider
rollout remains separate from these local checks.

Local verification on 18 September 2026 passed: 217 regular tests, 98 isolated
PostgreSQL integration tests, lint/type checks, migration consistency checks and
both production app builds. No deployed database migrations, live provider
requests or real customer email deliveries were performed.
