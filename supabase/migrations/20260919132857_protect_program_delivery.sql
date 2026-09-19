-- Cross-table delivery obligations need a trigger; a CHECK constraint cannot
-- inspect entitlements, order items, payments and sibling file rows.
CREATE OR REPLACE FUNCTION protect_owed_program_delivery_file()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_volume_id integer := OLD.program_volume_id;
  target_bucket text := OLD.r2_bucket;
BEGIN
  IF TG_OP = 'DELETE' AND NOT (OLD.is_active = true AND OLD.upload_status = 'ready') THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND NOT (
    OLD.is_active = true AND OLD.upload_status = 'ready'
    AND (NEW.is_active = false OR NEW.upload_status <> 'ready')
  ) THEN
    RETURN NEW;
  END IF;

  -- Foreign-key checks on new order/access rows and this row lock serialize
  -- checkout/fulfilment against the final-file decision.
  PERFORM 1 FROM program_volumes WHERE id = target_volume_id FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM program_files sibling
    WHERE sibling.program_volume_id = target_volume_id
      AND sibling.r2_bucket = target_bucket
      AND sibling.upload_status = 'ready' AND sibling.is_active = true
      AND sibling.id <> OLD.id
  ) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM program_access entitlement
    WHERE entitlement.program_volume_id = target_volume_id
      AND entitlement.status = 'active'
      AND (entitlement.expires_at IS NULL OR entitlement.expires_at > statement_timestamp())
  ) OR EXISTS (
    SELECT 1
    FROM order_items item
    JOIN orders sale ON sale.id = item.order_id
    JOIN payments payment ON payment.order_id = sale.id
    WHERE item.program_volume_id = target_volume_id
      AND payment.provider = 'paystack'
      AND (
        (sale.status = 'pending' AND payment.status = 'pending')
        OR (sale.status = 'paid' AND payment.status IN ('succeeded', 'partially_refunded'))
      )
  ) THEN
    RAISE EXCEPTION 'final owed program file cannot be withdrawn'
      USING ERRCODE = '23514', CONSTRAINT = 'program_files_preserve_owed_delivery';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER program_files_preserve_owed_delivery
BEFORE UPDATE OF is_active, upload_status OR DELETE ON program_files
FOR EACH ROW EXECUTE FUNCTION protect_owed_program_delivery_file();
