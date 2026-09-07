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

- `programs` stores the program family, such as Strong or Nourish.
- `program_volumes` stores sellable versions, such as Nourish Volume 1 and Nourish Volume 2.
- `program_files` stores Cloudflare R2 metadata. PDFs remain in a private R2 bucket; permanent public file URLs are never stored.
- `program_access` is the entitlement checked before issuing a short-lived download response. Access can originate from a purchase, manual grant, or promotion.

The customer-facing email should link to `/account/programs`. The Nuxt server verifies the session, linked client, and active entitlement before returning the R2 object through a binding or short-lived signed URL.

## Purchases and payments

- `orders` belongs to a client, snapshots the guest checkout email, and stores totals in integer cents.
- `order_items` records each purchased program volume and snapshots its description and price at checkout. Its integer `client_id` is constrained together with `order_id`, so an item cannot be linked to another order's client.
- `payments` records one payment attempt. An order may have multiple attempts so a
  customer can safely retry checkout without creating a duplicate order.
- Paystack references, transaction IDs, environment, raw provider status,
  checkout details, channel, fees, and verification time remain on `payments`;
  application logic uses the normalized payment status.
- `payment_events` is the idempotency and audit ledger for signed webhooks. Its
  provider event key prevents a retried event from fulfilling an order twice.
- `payment_refunds` records each full or partial refund independently. Its
  integer `payment_id`, provider, and currency must match the parent payment;
  active refund totals cannot exceed the original payment.

For example, R400 is stored as `40000`. If Nourish Volume 1 later costs R500, the old `order_items.unit_price_cents` remains `40000`, so purchase history stays accurate.

For the initial customer checkout, the public website should offer a direct
“Buy this program” action rather than requiring a basket. Guest checkout creates
or reuses the unique `clients` record by email and links the purchase through
integer IDs. The buyer authenticates with a passwordless email after payment,
at which point the verified Supabase identity is linked through
`users -> clients -> program_access`. The Nuxt server must calculate the price
from `program_volumes`, initialize Paystack, and return only the hosted checkout
URL or access code to the browser.

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

## Invoices

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
