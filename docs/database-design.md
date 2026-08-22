# Platform database design

The application separates authentication, customer records, purchases, billing, and file access. This keeps the model useful when a client buys multiple volumes, receives a manual entitlement, or has an invoice corrected later.

## Identity and permissions

- Supabase `auth.users` owns passwords, sessions, and authentication.
- `profiles` stores application profile fields for an authenticated user. `profiles.user_id` must match `auth.users.id`.
- `user_roles` stores `admin`, `staff`, or `customer` roles separately from editable profile fields.
- `clients` is the business record used by orders and invoices. A client can be created before they have a login, then linked through nullable `clients.user_id` after accepting an invitation.

Tilana will have a normal Supabase Auth user, a `profiles` row, and an `admin` row in `user_roles`. Public signup and profile update routes must never grant administrative roles.

## Programs and private files

- `programs` stores the program family, such as Strong or Nourish.
- `program_volumes` stores sellable versions, such as Nourish Volume 1 and Nourish Volume 2.
- `program_files` stores Cloudflare R2 metadata. PDFs remain in a private R2 bucket; permanent public file URLs are never stored.
- `program_access` is the entitlement checked before issuing a short-lived download response. Access can originate from a purchase, manual grant, or promotion.

The customer-facing email should link to `/account/programs`. The Nuxt server verifies the session, linked client, and active entitlement before returning the R2 object through a binding or short-lived signed URL.

## Purchases and payments

- `orders` belongs to a client and stores totals in integer cents.
- `order_items` records each purchased program volume and snapshots its description and price at checkout.
- `payments` records the payment provider, status, reference, amount, and paid time.

For example, R400 is stored as `40000`. If Nourish Volume 1 later costs R500, the old `order_items.unit_price_cents` remains `40000`, so purchase history stays accurate.

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

Drizzle owns application schemas, while Supabase owns the `auth` schema. After generating the first migration containing `profiles`, review it and add this constraint to that migration before applying it:

```sql
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_user_id_auth_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id")
  ON DELETE CASCADE;
```

All application tables have RLS enabled. Until user-facing RLS policies are deliberately added, only the trusted Nuxt server should query them. Server endpoints must still enforce authentication, role checks, client ownership, and entitlement checks because the privileged database connection bypasses RLS.
