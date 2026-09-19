# Program entitlement rules (ACCESS-02)

## Independent grants

`program_access` records independent grants, not one mutable customer/program
flag. Each purchased order item owns one permanent `purchase` grant through its
integer `order_item_id`. Manual sales retain their separate `manual` grants;
standalone manual/promotional grants can have their own start and expiry dates.
The unique order-item constraint and composite item/client/volume foreign key
remain enforced. The former unique active client/volume index is removed.

A customer can access a volume if **any** of their grants is active,
`starts_at <= now`, and has no expiry or `expires_at > now`. Start is inclusive;
expiry is exclusive. Listing, downloads and admin active-customer reporting use
the same server-only SQL predicate. Listings combine overlapping grants into
one volume card and deduplicate files. Publication/file availability remains
separate; ACCESS-03 is still open.

Verified payment fulfillment inserts each purchase's own grant even when a
temporary promotion, future manual grant or other purchase exists. Replays are
idempotent by order item and never reactivate an explicitly revoked/expired
grant. Partial refunds keep purchase access. Full refunds/reversals revoke
only grants linked to that order's items, preserving other purchases and
independent manual/promotional grants. The refund path does not fabricate or
resurrect a replacement grant. Payment row locks, webhook idempotency and
test/live isolation remain unchanged. No new grant-management UI is introduced.

## Migration and rollout

Review `20260918075403_superb_paper_doll.sql` before applying it. It removes the
active-row uniqueness restriction and inserts only missing purchase grants for
paid orders backed by a settled Paystack payment matching the order total and
currency, with a known environment, paid timestamp and remaining paid amount.
The order's subtotal must also match its recorded line totals.
It preserves existing grants, including revoked/expired ones. Repaired grants
begin at migration time rather than inventing a historical access timestamp.
Unconfirmed, mismatched, manual and refunded histories are not auto-repaired;
review inconsistent records and intentional withdrawals separately.

Pause checkout, webhook/recovery processing and admin financial/grant writes
during rollout. Back up and review the intended database and repair candidates;
the migration takes write-conflicting table locks inside the migration
transaction. Apply this forward migration **before** deploying the updated
admin/API code, then resume processing. Old code must not remain serving writes:
it can still skip grants or restore one lazily during a refund. Do not relabel
test history or use a shared test/live database. No deployed migration or
activation was performed by this task.

## Verification

Vitest route tests check authorization, ownership/date predicates, private
bucket/ready-file constraints, duplicate-card/file handling and download signing.
The opt-in PostgreSQL suite migrates an empty loopback test database and verifies
legacy repair, unconfirmed/mismatched exclusions, preserved revocation, interval
boundaries, promotions/manual overlap, future grants, repeated/concurrent
fulfillment, independent same-volume purchases, concurrent refunds, partial
refunds and composite ownership constraints. Paystack/SES are mocked.

Run `pnpm test`, `pnpm check`, `pnpm db:check` and `pnpm build:admin`.
For real PostgreSQL coverage, set `PAYSTACK_TEST_DATABASE_URL` to a fresh empty
local database named `tilana_paystack_test_<unique suffix>` and run
`pnpm --filter @tilana/admin test:integration`. The suite refuses deployed or
nonempty databases. Actual deployed browser/provider/refund checks remain
required launch evidence.
