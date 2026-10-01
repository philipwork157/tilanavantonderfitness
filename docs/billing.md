# Billing lifecycle (BILL-01)

## Scope and seller

Implemented locally: prepaid Paystack purchase invoices, manual/coaching
draft/issue/payment/refund workflows, original-preserving reissues, financial
replacement links and evidence-backed legacy purchase review.
The confirmed seller is Tilana van Tonder, a sole proprietor, at:

Ternberry Village, Cleveland 31  
Cape Town, Western Cape, 7580  
South Africa

The address is printed on private invoices, not added to the marketing site.
No VAT is charged; documents are titled `INVOICE`, not `TAX INVOICE`. This is
not a declaration that every legal/accounting obligation is satisfied. Review
requirements with the accountant. See [SARS registered-vendor tax invoice guidance](https://www.sars.gov.za/businesses-and-employers/my-business-and-tax/vat-connect-issue-20-october-2025/).

BILL-01's code implementation is complete for the workflows described here.
Deployment, real delivery/browser checks and accounting review remain launch
gates, not completed production evidence. Pre-existing unmanaged manual invoice
rows remain excluded; review/adopt them through an explicitly approved migration
rather than silently treating them as new documents.

## Admin manual/coaching workflow

Use **Invoices → Manage billing** with an existing client:

1. Create an invoice draft with service descriptions, quantities and integer-cent
   prices. It snapshots the client now and creates a `BILL-...` order and matching
   lines. It does not charge money, email the customer or grant program access.
   Draft numbers use the shared sequence and can leave gaps.
2. Inspect the invoice by its returned integer ID, then issue it. The invoice
   becomes immutable, the order pending and an email is queued. Customers can
   sign in to view an issued but unpaid service invoice without program access.
3. After confirming the actual bank/cash movement, record the full amount,
   actual receipt date, unique reference and evidence reason. This creates one
   `manual` payment, links `settled_payment_id`, marks the order/invoice paid and
   queues a payment-recorded edition. No bank transfer is initiated. References
   are normalised to uppercase; exact and case-variant duplicate references fail.
   Future receipt dates are rejected. Partial payments/instalments are not
   supported; a wrong amount is rejected instead of silently allocating it.
4. New coaching/service invoices never create program entitlements. For an
   already-recorded paid manual program purchase, use **existing paid manual
   order ID** with no new lines. Original order/items/payment are reused, not
   duplicated. New manual client orders capture buyer snapshots; older orders
   require evidence approval if those snapshots are missing. Conflicting
   invoices, mixed-provider histories or unresolved extra settlements are blocked.
5. A confirmed manual refund requires its actual bank/cash date, amount,
   reference and administrator reason. Dates before the receipt and amounts
   beyond the remaining balance are rejected. It appends a processed manual
   refund and credit, updating the payment ledger without rewriting the invoice.
   Full refunds revoke that order's program grants while preserving another
   valid paid purchase, using the shared refund entitlement boundary.

Manual receipt/refund entries are administrator attestations, not automated
bank verification. Never record them merely because a customer requests a refund.
Paystack invoices cannot use manual payment, refund or void actions: signed
provider evidence remains authoritative there.

## Correction and reissue

- Non-financial corrections append `invoice_editions` with customer name,
  address/phone, correction reason, issuing administrator and timestamp.
  Customer ownership, recipient email, seller, original lines, amounts and
  settlement cannot be changed through this command. An edition keeps the
  original invoice number, is labelled as a reissue (not a second receivable),
  and has a separate authenticated PDF/outbox target. The original PDF remains
  independently available. Unsupported PDF glyphs fail before commitment.
  PDFs are generated on demand, not archived byte-for-byte: the original view
  keeps original billing snapshots but displays later payment/void annotations.
  The receipt/refund ledger and append-only commands preserve those transitions.
- Unpaid manual drafts/issued invoices can be voided, never deleted. Pending
  notifications are marked cancelled, not falsely marked delivered. Already
  accepted/in-flight email cannot be recalled; the authenticated document shows
  the void status. A voided unissued draft is never exposed to customers.
- Financial replacements require a void or fully credited manual original for
  the same client. The new draft links `replaces_invoice_id`; only one direct
  replacement is permitted. A paid original requires confirmed refund credits
  for its entire amount first and retains its original paid record. The new
  invoice is a separate receivable, not a transferred or invented payment.
- For a Paystack financial correction, use the existing provider refund workflow
  and a deliberate new checkout when a new purchase is required. Reissuing a PDF
  cannot hide a refund, alter access or fabricate a charge.

All lifecycle commands use durable hashed idempotency keys bound to actor,
target and validated payload. Browser retries retain only digest/key pairs in
session storage after a lost response; no billing payload is stored there.
Committed responses clear the retry key. Repeated commands with the same key
return the original result; changed details/actors get 409. Audit commands,
editions and approved review evidence are append-only.

## Legacy exception approval

Inspect original order/items and selected payment attempts from the protected
admin review view. Obtain original purchase/receipt evidence, then approve the
buyer name/email/phone, selected payment ID and evidence reference. Existing
original snapshots cannot be overridden. The approval preserves the order and
payment records rather than copying an edited client profile into history.

Additional settled attempts must belong to the same provider and already have
zero remaining balance through a completed refund/reversal before approval.
Unresolved overpayments, mixed-provider cases, conflicting evidence and existing
issued invoices remain blocked and require operator/provider/accountant review.
Approval itself never charges/refunds money or changes entitlements. The worker
revalidates Paystack evidence before issuance; an existing manual purchase uses
the explicit invoice-existing-order command. Existing customer-email/auth-link
changes need separate identity review; reissues do not forward private documents
to a different email address.

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

`invoice_deliveries` has one initial message per invoice, one per credit and one
per corrected/payment-recorded edition. Cancelled records are not claimable.
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
- Issued purchase and managed manual invoice/items, billed order snapshots and
  settled manual payment evidence reject destructive edits/deletion. Manual
  state transitions are limited to issuance, evidenced payment and unpaid void.
- Deferred validation requires complete paid invoices with consistent settlement
  and line totals at commit; no stranded issued invoice without lines.
- Credit triggers lock the invoice, validate refund/reversal ownership/evidence,
  and prevent credited totals exceeding the invoice.
- Delivery credit ownership and immutable targets are checked independently.
- Edition/delivery association, replacement ownership/state, immutable admin
  evidence, one managed invoice/order and manual line/settlement consistency are
  checked independently in PostgreSQL. Legacy rows are not silently relabelled.

## Rollout checklist (not performed)

- [ ] Review/apply `20260917155837_polite_shockwave.sql` and
  `20260917155928_marvelous_iron_patriot.sql` in the intended isolated database.
  Review existing invoice/order client mismatches before adding the composite
  FK. Never silently change financial ownership to pass a migration.
- [ ] Review/apply `20260918054700_free_spirit.sql`,
  `20260918054905_steady_quasar.sql` and `20260918060107_grey_spot.sql` before
  deploying the manual/reissue/review APIs. These add three integer/RLS tables
  (`invoice_commands`, `invoice_editions`, `invoice_purchase_reviews`), columns,
  indexes and reviewed triggers; they were applied only to disposable test DBs.
- [ ] Review older purchases missing original buyer snapshots. They remain
  flagged for review rather than inventing historic details from current profiles.
- [ ] Deploy the backend capturing buyer snapshots on new checkouts.
- [ ] Set Fly runtime `NUXT_INVOICE_BILLING_ENABLED=true` to opt in.
- [ ] In test mode enable `NUXT_EMAIL_DEVELOPMENT_ENABLED=true` and set `NUXT_EMAIL_DEVELOPMENT_RECIPIENT` to a safe inbox.
  Test delivery fails closed without it; live delivery ignores this redirect.
- [ ] Configure existing AWS SES region/credentials and verified sender.
- [ ] Activate the protected PAY-05 scheduler and matching environment token.
  No Fly cron migration is included; GitHub remains the existing trigger.
- [ ] Configure scheduler failure notifications and independent heartbeat,
  oldest-item-age and issuance/delivery backlog monitoring; review throughput.
- [ ] Validate actual SES delivery, a two-program isolated Paystack test purchase,
  partial/full refunds, reversal, downloaded contents and cross-customer denial.
- [ ] Review the implemented correction/reissue, receipt, replacement and legacy
  evidence policy with the accountant. Check manual/coaching and Paystack flows
  through actual authenticated browser interactions and test-inbox delivery.

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

Local verification on 18 September 2026 passed: 237 regular tests, 123 isolated
PostgreSQL integration tests, lint/type checks, migration consistency checks and
both production app builds. No deployed database migrations, live provider
requests or real customer email deliveries were performed.

The completed administration coverage includes concurrent draft/receipt retries,
changed-payload conflicts, unpaid/draft privacy, evidenced payments/refunds,
immutable originals/editions, void/full-credit replacement links, safe inspection,
legacy evidence/zero-balance allocation, unpaid billing identity linking and
existing manual purchases without duplicate sales. A full manual refund preserves
another independently paid program entitlement. The PDF skill guided font,
pagination and visual QA for reissued and unpaid service documents.
