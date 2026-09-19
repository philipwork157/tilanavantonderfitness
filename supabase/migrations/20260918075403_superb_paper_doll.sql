-- Pause competing sale/access writes while preserving provenance and repairing
-- only missing grants backed by a matching settled Paystack payment.
LOCK TABLE orders, payments, order_items, program_access IN SHARE ROW EXCLUSIVE MODE;
--> statement-breakpoint
DROP INDEX "program_access_client_volume_active_unique";
--> statement-breakpoint
INSERT INTO program_access (client_id, program_volume_id, order_item_id, source)
SELECT item.client_id, item.program_volume_id, item.id, 'purchase'
FROM order_items AS item
JOIN orders AS sale ON sale.id = item.order_id AND sale.client_id = item.client_id
WHERE item.program_volume_id IS NOT NULL
  AND sale.status = 'paid'
  AND sale.subtotal_cents = (SELECT sum(line.line_total_cents) FROM order_items AS line WHERE line.order_id = sale.id)
  AND NOT EXISTS (SELECT 1 FROM program_access AS entitlement WHERE entitlement.order_item_id = item.id)
  AND EXISTS (
    SELECT 1 FROM payments AS payment
    WHERE payment.order_id = sale.id AND payment.provider = 'paystack'
      AND payment.status IN ('succeeded', 'partially_refunded')
      AND payment.environment IN ('test', 'live')
      AND payment.amount_cents = sale.total_cents AND payment.currency = sale.currency
      AND payment.refunded_amount_cents < payment.amount_cents
      AND payment.paid_at IS NOT NULL
  )
ON CONFLICT (order_item_id) DO NOTHING;
