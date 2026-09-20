-- Protect paid history even while invoice creation is disabled or delayed.
CREATE FUNCTION purchase_is_settled(target_id integer) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM orders WHERE id = target_id
    AND (paid_at IS NOT NULL OR status IN ('paid', 'refunded')))
    OR EXISTS (SELECT 1 FROM payments WHERE order_id = target_id
      AND (paid_at IS NOT NULL OR status IN ('succeeded', 'partially_refunded', 'refunded', 'reversed')));
$$;
--> statement-breakpoint
CREATE FUNCTION protect_settled_order() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF purchase_is_settled(OLD.id) THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Settled purchases cannot be deleted'; END IF;
    IF (to_jsonb(NEW) - ARRAY['status','paid_at','updated_at']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','paid_at','updated_at'])
      OR (OLD.paid_at IS NOT NULL AND NEW.paid_at IS DISTINCT FROM OLD.paid_at)
      OR NEW.status NOT IN ('paid', 'refunded') THEN
      RAISE EXCEPTION 'Settled purchase snapshots are immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER settled_order_immutable BEFORE UPDATE OR DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION protect_settled_order();
--> statement-breakpoint
-- Child writers share the parent's row lock with settlement. Lock both ends of moves.
CREATE FUNCTION protect_settled_order_item() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE source_id integer; destination_id integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN source_id := OLD.order_id; END IF;
  IF TG_OP <> 'DELETE' THEN destination_id := NEW.order_id; END IF;
  PERFORM id FROM orders WHERE id IN (source_id, destination_id) ORDER BY id FOR UPDATE;
  IF purchase_is_settled(source_id) OR purchase_is_settled(destination_id)
    OR EXISTS (SELECT 1 FROM invoices WHERE order_id IN (source_id, destination_id)
      AND managed = 1 AND status <> 'draft') THEN
    RAISE EXCEPTION 'Settled or issued purchase lines are immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER settled_order_item_immutable BEFORE INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW EXECUTE FUNCTION protect_settled_order_item();
--> statement-breakpoint
CREATE FUNCTION protect_settled_payment() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE source_id integer; destination_id integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN source_id := OLD.order_id; END IF;
  IF TG_OP <> 'DELETE' THEN destination_id := NEW.order_id; END IF;
  PERFORM id FROM orders WHERE id IN (source_id, destination_id) ORDER BY id FOR UPDATE;
  IF TG_OP <> 'INSERT' AND (OLD.paid_at IS NOT NULL OR
    OLD.status IN ('succeeded', 'partially_refunded', 'refunded', 'reversed')) THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Settled payment evidence cannot be deleted'; END IF;
    IF ROW(NEW.id, NEW.order_id, NEW.provider, NEW.provider_reference, NEW.provider_transaction_id,
      NEW.environment, NEW.amount_cents, NEW.currency, NEW.checkout_intent_key_hash, NEW.checkout_request_hash, NEW.created_at)
      IS DISTINCT FROM ROW(OLD.id, OLD.order_id, OLD.provider, OLD.provider_reference, OLD.provider_transaction_id,
      OLD.environment, OLD.amount_cents, OLD.currency, OLD.checkout_intent_key_hash, OLD.checkout_request_hash, OLD.created_at)
      OR (OLD.paid_at IS NOT NULL AND NEW.paid_at IS DISTINCT FROM OLD.paid_at)
      OR NEW.status NOT IN ('succeeded', 'partially_refunded', 'refunded', 'reversed') THEN
      RAISE EXCEPTION 'Settled payment snapshots are immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER settled_payment_immutable BEFORE INSERT OR UPDATE OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION protect_settled_payment();
--> statement-breakpoint
-- Deferred checks permit atomic fulfillment in either statement order, but not
-- a commit with mismatched line totals, payment amount or currency.
CREATE FUNCTION validate_settled_purchase() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE target_id integer; purchase orders; item_count bigint; line_sum bigint;
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN target_id := NEW.id; ELSE target_id := NEW.order_id; END IF;
  SELECT * INTO purchase FROM orders WHERE id = target_id;
  IF NOT FOUND OR NOT purchase_is_settled(target_id) THEN RETURN NULL; END IF;
  SELECT count(*), coalesce(sum(line_total_cents), 0) INTO item_count, line_sum
    FROM order_items WHERE order_id = target_id;
  IF item_count = 0 OR line_sum <> purchase.subtotal_cents THEN
    RAISE EXCEPTION 'Settled purchase line totals do not match the order';
  END IF;
  IF EXISTS (SELECT 1 FROM payments WHERE order_id = target_id
    AND (paid_at IS NOT NULL OR status IN ('succeeded', 'partially_refunded', 'refunded', 'reversed'))
    AND (amount_cents <> purchase.total_cents OR currency <> purchase.currency)) THEN
    RAISE EXCEPTION 'Settled payment amount or currency does not match the order';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER settled_order_consistent AFTER INSERT OR UPDATE ON orders
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_settled_purchase();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER settled_payment_consistent AFTER INSERT OR UPDATE ON payments
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_settled_purchase();
