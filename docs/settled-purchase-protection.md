# Settled purchase protection (REAUDIT-01)

`20260920035033_protect_settled_purchases.sql` adds functions and triggers to
existing tables. It creates no application table or identity column and does
not rewrite historical financial data.

## Boundary

An order is protected when it has a paid timestamp, paid/refunded status, or a
payment with a paid timestamp or settled/refunded/reversed status. Protection
does not depend on an invoice existing or the invoice worker being enabled.

- Order customer/financial snapshots cannot change or be deleted after settlement.
- Lines cannot be inserted, edited, deleted, or moved into/out of a settled
  order. Both endpoints of a move are checked. Issued managed invoices retain
  their existing protection too.
- Settled payment identity, provider reference/transaction, environment, amount,
  currency, intent hashes and established paid timestamp cannot be rewritten.
  Verification metadata and legitimate refund/reversal updates remain possible.
  Existing refund overage and invoice constraints still apply.
- Deferred checks require at least one line, a line sum matching the subtotal,
  and each settled payment's amount/currency matching the order. Existing row
  checks continue to enforce line arithmetic and discount/tax totals.
- Child writes lock parent orders so settlement cannot race a concurrent line
  mutation past the guards.

Create the complete set of lines before marking an order/payment settled, in
one transaction. Manual client creation and reservation settlement now follow
this sequence. These guards do not replace signed-provider verification or
authorization. Billing's existing multiple-settlement review remains intact;
the guards do not assume two full payment attempts can never both succeed.

## Rollout and legacy preflight

1. Review the forward SQL and back up the intended database.
2. Preflight existing settled purchases for missing lines, aggregate differences,
   payment/order amount or currency differences, and missing buyer evidence.
   This read-only query identifies financial inconsistencies:

   ```sql
   SELECT o.id, o.order_number
   FROM orders o
   WHERE (o.paid_at IS NOT NULL OR o.status IN ('paid', 'refunded')
     OR EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id
       AND (p.paid_at IS NOT NULL OR p.status IN
         ('succeeded', 'partially_refunded', 'refunded', 'reversed'))))
   AND (NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id)
     OR o.subtotal_cents <> (SELECT coalesce(sum(i.line_total_cents), 0)
       FROM order_items i WHERE i.order_id = o.id)
     OR EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id
       AND (p.paid_at IS NOT NULL OR p.status IN
         ('succeeded', 'partially_refunded', 'refunded', 'reversed'))
       AND (p.amount_cents <> o.total_cents OR p.currency <> o.currency)));
   ```

   Investigate results against original evidence. Do not invent buyer snapshots,
   relabel payments, disable guards, or erase history to make them pass. This
   migration does not silently repair legacy inconsistencies; subsequent writes
   to inconsistent settled rows can fail until reviewed.
3. Pause financial/manual-client writers for the version handover, including
   webhook/recovery processing. Deploy the updated manual-client sequencing and
   apply the reviewed migration; do not leave older writers running afterward.
4. Verify checkout, manual settlement, invoices and refunds/reversals on isolated
   test infrastructure before resuming traffic.

Only disposable local PostgreSQL was migrated for this implementation. Deployed
migration and provider smoke-test evidence remain launch tasks.

## Regression coverage

`apps/admin/tests/helpers/settled-purchase-cases.ts` covers paid/unbilled,
draft-invoice and issued-invoice protection, both directions of line moves,
amount/currency/aggregate rejection, rollback, and concurrent line mutation
versus settlement. The broader financial suite continues to exercise manual
purchases, invoices, refunds, reversals and recovery. Legacy entitlement-repair
fixtures run before the new migration, without disabling current-schema guards.
