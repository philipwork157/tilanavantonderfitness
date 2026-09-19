# Platform database design

The application separates authentication, customer records, purchases, billing, and file access. This keeps the model useful when a client buys multiple volumes, receives a manual entitlement, or has an invoice corrected later.

## Identity and permissions

- Supabase `auth.users` owns passwords, sessions, and authentication.
- `users` stores application profile fields. Its auto-incrementing integer `id`
  is used by application relationships, while `users.supabase_id` uniquely
  references the UUID in `auth.users.id`.
- `user_roles` stores `admin`, `staff`, or `customer` roles separately from editable profile fields.
- `clients` is the business record used by orders and invoices. A client can be created before they have a login, then linked through nullable `clients.user_id` after accepting an invitation.
- Client email addresses are unique case-insensitively so a verified Supabase
  account can claim exactly one pre-existing guest customer record.

Tilana will have a normal Supabase Auth user, a `users` row, and an `admin` row in `user_roles`. Public signup and profile update routes must never grant administrative roles.

Every application-owned table uses an auto-incrementing integer `id`. Foreign
keys such as `clients.user_id`, `orders.client_id`, and
`order_items.order_id` always reference these internal integer IDs. Supabase's
UUID is never used as an application foreign key outside `users.supabase_id`.

## Programs and private files

- `programs` stores the program family, marketing card content, publication
  state, and display order, such as Strong or Nourish.
- `program_volumes` stores sellable versions, stable checkout slugs, current
  integer-cent prices, and publication order, such as Nourish Volume 1 and
  Nourish Volume 2.
- `program_media` stores versioned public cover-image metadata. Only ready,
  active media is eligible for the public catalogue.
- `program_files` stores private Cloudflare R2 PDF metadata and its pending,
  ready, or failed upload lifecycle. Permanent public file URLs are never
  stored. The final ready file cannot be withdrawn while active/future grants
  or provider-confirmable Paystack orders still require delivery; replacement
  is atomic. See [program delivery protection](./program-delivery-protection.md).
- `program_access` is the entitlement checked before issuing a short-lived download response. Access can originate from a purchase, manual grant, or promotion.
  Independent grants may overlap for the same customer/volume. Each sale keeps
  its order-item provenance; authorization requires any active grant whose
  inclusive start and exclusive expiry contain the current time. See
  [program-entitlements.md](./program-entitlements.md).
- `program_audit_events` is the append-only history of catalogue, price,
  publication, and file-management actions. It stores safe summaries rather
  than secrets or signed URLs.

The customer-facing email should link to `/account/programs`. The Nuxt server verifies the session, linked client, and active entitlement before returning the R2 object through a binding or short-lived signed URL.

## Purchases and payments

- `orders` belongs to a client, snapshots the guest checkout email, and stores totals in integer cents.
- `order_items` records each purchased program volume and snapshots its description and price at checkout. Its integer `client_id` is constrained together with `order_id`, so an item cannot be linked to another order's client.
- `payments` records one payment attempt. An order may have multiple attempts so a
  customer can safely retry checkout without creating a duplicate order.
- Paystack references, transaction IDs, environment, raw provider status,
  checkout details, channel, fees, and verification time remain on `payments`;
  application logic uses the normalized payment status.
- Paystack checkout payments store paired SHA-256 intent-key/request hashes.
  A partial unique constraint on provider, environment, and key hash plus
  transaction serialization ensures one order/payment per browser intent.
  The request hash binds normalized customer details and purchased-price
  snapshots; changing those details under an existing key is rejected. Old
  payments retain null hashes. No extra UUID columns or application IDs are added.
- `payment_events` is the idempotency and audit ledger for signed webhooks. Its
  provider event key prevents a retried event from fulfilling an order twice.
  Signatures are checked against the untouched request, but the ledger stores
  only event-specific reconciliation fields and a SHA-256 payload digest—never
  Paystack customer, metadata, or reusable authorization objects. Processed and
  ignored replay details expire after 30 days and the recovery worker replaces
  them with a redaction marker while retaining the digest and normalized audit
  columns. Deferred/failed evidence remains until it is resolved or reviewed.
- `payment_refunds` records each full or partial refund independently. Its
  integer `payment_id`, provider, and currency must match the parent payment;
  active refund totals cannot exceed the original payment.
- `payment_refunds.provider_refund_id` stores the Paystack refund API ID;
  `provider_refund_reference` separately stores its processor/webhook reference.
  Both are unique external text identifiers, never internal relationship keys.
  Identifier-less events bind only to an unambiguous matching refund for that
  payment and amount. Ambiguous equal refunds are recorded as failed audit
  events for Paystack review; they do not create another reservation.

For example, R400 is stored as `40000`. If Nourish Volume 1 later costs R500, the old `order_items.unit_price_cents` remains `40000`, so purchase history stays accurate.

The public website provides a browser-side basket for up to ten different
programme volumes, with a maximum quantity of one for each digital product.
Guest checkout creates or reuses the unique `clients` record by email and links
every order item through integer IDs. The buyer authenticates with a passwordless
email after payment, at which point the verified Supabase identity is linked
through `users -> clients -> program_access`. The Nuxt server must resolve every
slug, validate the displayed prices, calculate the total from `program_volumes`,
initialize Paystack, and return only the hosted checkout URL or access code to
the browser. The basket never supplies an authoritative price or total.

Duplicate checkout submissions with the same intent reuse the existing
payment and immutable order lines. Initialization is claimed durably before
the external request and has a bounded timeout. A lost browser response can
resume the saved URL. An uncertain provider response leaves the same payment
pending and requires verification/webhook confirmation or operator review;
it must not release the intent for another provider initialization. Deliberate
later purchases use a fresh key. See [checkout-idempotency.md](./checkout-idempotency.md).

The Paystack callback is a user-interface return path, not proof of payment.
Only a server-verified successful payment with the expected reference, amount,
and currency may atomically mark the payment and order as paid and create
`program_access`. Replayed callbacks and webhook deliveries must be safe no-ops.
Processed full-refund events mark the order as refunded and revoke access tied
to its order items. Partial refunds update the payment ledger but leave access
active until the full payment amount has been refunded.

Administrators can request a full or partial refund from the client list. The
authenticated, same-origin server endpoint validates an integer-cent amount,
reserves it in `payment_refunds`, and calls Paystack with the server-only secret
key. Only one unsettled refund is allowed per payment. A timeout or malformed
provider response is marked `needs-attention` and keeps the amount reserved so
an administrator cannot accidentally submit a duplicate. Signed Paystack
refund webhooks remain the source of truth for the final status and access
change.

After payment, a customer requests a passwordless link using the same email
address. The Nuxt server generates a Supabase Auth token without asking
Supabase to deliver email, sends the branded access link through AWS SES, and
verifies its token hash at the callback. The callback creates the integer-keyed
`users` row only for a verified Supabase identity, links `clients.user_id`, and
grants the `customer` role. Private program files are returned as short-lived
R2 download redirects only after the server checks that integer-linked
entitlement.

## Payment recovery and disputes

`customer_notifications` is an RLS-enabled integer-keyed access email outbox.
An order/client composite FK protects purchase notification ownership; unique
keys deduplicate order notifications and five-minute login requests. It stores
lease/retry/acceptance/cancellation timestamps, never authentication tokens.
See [customer-access-delivery.md](./customer-access-delivery.md).

PAY-05 adds `payment_recovery_jobs` (one durable job per integer payment ID,
due time, expiring/versioned lease, retry count and operator alert state) and
`payment_disputes` (provider dispute ID, integer payment link, provider outcome
and amount). Both tables have RLS enabled and restrictive payment foreign keys.
Disputes do not create ordinary refund reservations. Deferred prerequisite
events retain `received` status; controlled replay preserves the original event.
See [recovery operations](./paystack-recovery.md) for policy and activation.

## Invoices

Manual client profile edits preserve all recorded sale rows and timestamps.
The manual editor can replace/settle only pending reservations without payment
attempts, invoices or a paid timestamp. Recorded financial changes are rejected;
corrections must use a separate audited workflow, not delete/recreate history.

The prepaid Paystack lifecycle is implemented in [billing.md](./billing.md).
`invoices.source = 'purchase'` is unique per order and links an integer
`settled_payment_id`. A composite order/client FK prevents ownership mismatches.
`orders.customer_name/customer_email/customer_phone` preserve checkout buyer
details independently of editable client profiles. `invoice_credits` preserves
refund/reversal adjustments, with exact refund links where applicable, invoice
locks and overage protection. `invoice_deliveries` is the versioned SES outbox;
`invoice_processing_jobs` tracks issuance review/backoff. All have integer IDs
and RLS. Issued purchase documents/lines and credits are immutable; deferred
validation checks settlement and line totals. PDFs are generated privately on
demand, not written to R2. `managed = 1` marks new/manual-adopted billing documents
so legacy manual invoice rows are not silently exposed. `invoice_commands` owns
append-only actor/reason/idempotency evidence; `invoice_editions` preserves
non-financial reissues; `invoice_purchase_reviews` stores approved original
evidence without rewriting orders. All IDs/FKs are integer and RLS-enabled.
Manual drafts create service orders/items but no entitlements; settled manual
payments/refunds are separate evidence-driven records. `replaces_invoice_id`
links one replacement to a void or fully credited manual original of the same
client. Deferred checks and immutability triggers protect managed manual
invoice/items, billed order snapshots and settled manual payment evidence.

- `invoices` can reference an order but keeps immutable seller and client billing snapshots.
- `invoice_items` snapshots descriptions and prices independently from the live catalogue.
- Generated invoice PDFs can be stored privately in R2 using the invoice's R2 bucket and object key fields.

This supports draft, issued, paid, overdue, and void invoices. Multiple invoices may reference the same order so a voided or corrected invoice does not destroy the original audit history.

## Common admin questions

To answer “what did this client buy?”, query:

`clients -> orders -> order_items -> program_volumes -> programs`

To answer “what can this client download?”, query:

`clients -> program_access (active) -> program_volumes -> program_files (active)`

To answer “what did they actually pay?”, use successful `payments` and compare the sum with `orders.total_cents`. Do not use the program's current price for historical reporting.

## Migration note

Drizzle owns application schemas, while Supabase owns the `auth` schema. Because
Drizzle does not manage cross-schema Supabase Auth relationships, migrations
must retain this constraint:

```sql
ALTER TABLE "users"
  ADD CONSTRAINT "users_supabase_id_auth_users_id_fk"
  FOREIGN KEY ("supabase_id") REFERENCES "auth"."users"("id")
  ON DELETE CASCADE;
```

All application tables have RLS enabled. Until user-facing RLS policies are deliberately added, only the trusted Nuxt server should query them. Server endpoints must still enforce authentication, role checks, client ownership, and entitlement checks because the privileged database connection bypasses RLS.
