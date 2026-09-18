ALTER TABLE "invoice_deliveries" ADD COLUMN "canceled_at" timestamp with time zone;
--> statement-breakpoint
-- Extend snapshot protection to the new, explicitly managed manual lifecycle.
CREATE OR REPLACE FUNCTION protect_purchase_invoice() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.source = 'purchase' AND OLD.status <> 'draft' THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Issued purchase invoices cannot be deleted'; END IF;
    IF (to_jsonb(NEW) - ARRAY['reconciled_at','pdf_r2_bucket','pdf_r2_object_key','updated_at']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['reconciled_at','pdf_r2_bucket','pdf_r2_object_key','updated_at']) THEN RAISE EXCEPTION 'Issued purchase invoice snapshots are immutable'; END IF;
  END IF;
  IF OLD.managed = 1 THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Managed invoices cannot be deleted'; END IF;
    IF NEW.managed <> 1 THEN RAISE EXCEPTION 'Managed invoices cannot be downgraded'; END IF;
    IF OLD.source = 'manual' AND OLD.status <> 'draft' THEN
      IF (to_jsonb(NEW) - ARRAY['status','paid_at','settled_payment_id','updated_at']) IS DISTINCT FROM
         (to_jsonb(OLD) - ARRAY['status','paid_at','settled_payment_id','updated_at']) THEN RAISE EXCEPTION 'Issued manual invoice snapshots are immutable'; END IF;
      IF OLD.status = 'issued' AND NEW.status = 'paid' THEN
        IF NEW.paid_at IS NULL OR NEW.settled_payment_id IS NULL THEN RAISE EXCEPTION 'Settlement evidence required'; END IF;
      ELSIF OLD.status = 'issued' AND NEW.status = 'void' THEN
        IF NEW.paid_at IS NOT NULL OR NEW.settled_payment_id IS NOT NULL THEN RAISE EXCEPTION 'Paid invoices cannot be voided'; END IF;
      ELSIF NEW.status IS DISTINCT FROM OLD.status OR NEW.paid_at IS DISTINCT FROM OLD.paid_at OR NEW.settled_payment_id IS DISTINCT FROM OLD.settled_payment_id THEN
        RAISE EXCEPTION 'Invalid manual invoice transition';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_purchase_invoice_item() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE target_id integer; target invoices%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN target_id := NEW.invoice_id; ELSE target_id := OLD.invoice_id; END IF;
  SELECT * INTO target FROM invoices WHERE id = target_id FOR UPDATE;
  IF (target.source = 'purchase' OR target.managed = 1) AND target.status <> 'draft' THEN RAISE EXCEPTION 'Issued invoice lines are immutable'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.invoice_id <> OLD.invoice_id THEN RAISE EXCEPTION 'Invoice lines cannot move'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION validate_managed_invoice() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE target invoices%ROWTYPE; purchase orders%ROWTYPE; settlement payments%ROWTYPE; original invoices%ROWTYPE; lines bigint;
BEGIN
  IF TG_TABLE_NAME = 'invoice_items' THEN
    IF TG_OP = 'DELETE' THEN SELECT * INTO target FROM invoices WHERE id = OLD.invoice_id;
    ELSE SELECT * INTO target FROM invoices WHERE id = NEW.invoice_id; END IF;
  ELSE SELECT * INTO target FROM invoices WHERE id = NEW.id; END IF;
  IF target.managed <> 1 OR target.source <> 'manual' THEN RETURN NULL; END IF;
  SELECT * INTO purchase FROM orders WHERE id = target.order_id;
  SELECT sum(line_total_cents) INTO lines FROM invoice_items WHERE invoice_id = target.id;
  IF target.order_id IS NULL OR purchase.client_id <> target.client_id OR purchase.total_cents <> target.total_cents OR purchase.currency <> target.currency
     OR target.currency <> 'ZAR' OR target.tax_cents <> 0 OR target.seller_tax_number IS NOT NULL OR target.total_cents <= 0
     OR lines IS DISTINCT FROM target.subtotal_cents::bigint THEN RAISE EXCEPTION 'Manual invoice lines/order are inconsistent'; END IF;
  IF target.status NOT IN ('draft','issued','paid','void') THEN RAISE EXCEPTION 'Unsupported managed invoice status'; END IF;
  IF target.status IN ('issued','paid') AND (target.issued_at IS NULL OR target.issue_date IS NULL) THEN RAISE EXCEPTION 'Issuance evidence required'; END IF;
  IF target.status = 'paid' THEN
    SELECT * INTO settlement FROM payments WHERE id = target.settled_payment_id;
    IF target.settled_payment_id IS NULL OR target.paid_at IS NULL OR settlement.provider <> 'manual' OR settlement.order_id <> target.order_id
      OR settlement.currency <> target.currency OR settlement.amount_cents <> target.total_cents OR settlement.paid_at IS DISTINCT FROM target.paid_at
      OR settlement.status NOT IN ('succeeded','partially_refunded','refunded') THEN RAISE EXCEPTION 'Manual settlement evidence is inconsistent'; END IF;
  ELSIF target.settled_payment_id IS NOT NULL OR target.paid_at IS NOT NULL THEN RAISE EXCEPTION 'Unpaid invoice cannot have settlement'; END IF;
  IF target.replaces_invoice_id IS NOT NULL THEN
    SELECT * INTO original FROM invoices WHERE id = target.replaces_invoice_id;
    IF original.id = target.id OR (original.status <> 'void' AND NOT (original.status = 'paid' AND (SELECT coalesce(sum(amount_cents), 0) FROM invoice_credits WHERE invoice_id = original.id) = original.total_cents)) OR original.source <> 'manual' OR original.managed <> 1 OR original.client_id <> target.client_id THEN
      RAISE EXCEPTION 'Invalid replacement invoice';
    END IF;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER managed_invoice_consistent AFTER INSERT OR UPDATE ON invoices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_managed_invoice();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER managed_invoice_lines_consistent AFTER INSERT OR UPDATE OR DELETE ON invoice_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_managed_invoice();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_invoice_credit() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE target invoices%ROWTYPE; settlement payments%ROWTYPE; refund payment_refunds%ROWTYPE; credited bigint;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Issued credit notes are immutable'; END IF;
  SELECT * INTO target FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
  SELECT * INTO settlement FROM payments WHERE id = NEW.payment_id;
  IF (target.source <> 'purchase' AND NOT (target.source = 'manual' AND target.managed = 1)) OR target.status <> 'paid' OR target.settled_payment_id <> NEW.payment_id THEN
    RAISE EXCEPTION 'Credit note payment does not match invoice'; END IF;
  IF NEW.reason = 'refund' THEN
    SELECT * INTO refund FROM payment_refunds WHERE id = NEW.refund_id;
    IF refund.payment_id <> NEW.payment_id OR refund.status <> 'processed' OR refund.currency <> target.currency
       OR refund.amount_cents <> NEW.amount_cents OR NEW.source_key <> 'refund:' || NEW.refund_id::text THEN RAISE EXCEPTION 'Credit note refund evidence is inconsistent'; END IF;
  ELSIF settlement.provider <> 'paystack' OR settlement.status <> 'reversed' OR NEW.source_key <> 'reversal:' || NEW.payment_id::text THEN
    RAISE EXCEPTION 'Credit note reversal evidence is inconsistent'; END IF;
  SELECT coalesce(sum(amount_cents), 0) INTO credited FROM invoice_credits WHERE invoice_id = target.id;
  IF credited + NEW.amount_cents > target.total_cents THEN RAISE EXCEPTION 'Invoice credit overage'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION validate_invoice_delivery() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.credit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM invoice_credits WHERE id = NEW.credit_id AND invoice_id = NEW.invoice_id) THEN RAISE EXCEPTION 'Invoice delivery credit belongs to another invoice'; END IF;
  IF NEW.edition_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM invoice_editions WHERE id = NEW.edition_id AND invoice_id = NEW.invoice_id) THEN RAISE EXCEPTION 'Invoice delivery edition belongs to another invoice'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.invoice_id IS DISTINCT FROM OLD.invoice_id OR NEW.credit_id IS DISTINCT FROM OLD.credit_id OR NEW.edition_id IS DISTINCT FROM OLD.edition_id) THEN RAISE EXCEPTION 'Invoice delivery target is immutable'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE FUNCTION protect_billing_audit() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Billing evidence is append-only'; END IF;
  IF TG_TABLE_NAME = 'invoice_editions' THEN
    IF NOT EXISTS (SELECT 1 FROM invoices WHERE id = NEW.invoice_id AND status IN ('issued','paid') AND (source = 'purchase' OR managed = 1)) THEN RAISE EXCEPTION 'Edition requires an issued invoice'; END IF;
  ELSIF TG_TABLE_NAME = 'invoice_purchase_reviews' THEN
    IF NOT EXISTS (SELECT 1 FROM payments WHERE id = NEW.payment_id AND order_id = NEW.order_id AND provider IN ('paystack','manual') AND paid_at IS NOT NULL) THEN RAISE EXCEPTION 'Review payment belongs to another order or lacks settlement'; END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER invoice_editions_append_only BEFORE INSERT OR UPDATE OR DELETE ON invoice_editions FOR EACH ROW EXECUTE FUNCTION protect_billing_audit();
--> statement-breakpoint
CREATE TRIGGER invoice_purchase_reviews_append_only BEFORE INSERT OR UPDATE OR DELETE ON invoice_purchase_reviews FOR EACH ROW EXECUTE FUNCTION protect_billing_audit();
--> statement-breakpoint
CREATE TRIGGER invoice_commands_append_only BEFORE UPDATE OR DELETE ON invoice_commands FOR EACH ROW EXECUTE FUNCTION protect_billing_audit();
--> statement-breakpoint
CREATE FUNCTION protect_managed_order() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM invoices WHERE order_id = OLD.id AND managed = 1) THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Billed orders cannot be deleted'; END IF;
    IF (to_jsonb(NEW) - ARRAY['status','paid_at','updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','paid_at','updated_at'])
      OR (OLD.paid_at IS NOT NULL AND NEW.paid_at IS DISTINCT FROM OLD.paid_at) THEN RAISE EXCEPTION 'Billed order snapshots are immutable'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER managed_order_immutable BEFORE UPDATE OR DELETE ON orders FOR EACH ROW EXECUTE FUNCTION protect_managed_order();
--> statement-breakpoint
CREATE FUNCTION protect_managed_order_item() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE target_id integer;
BEGIN
  IF TG_OP = 'INSERT' THEN target_id := NEW.order_id; ELSE target_id := OLD.order_id; END IF;
  IF EXISTS (SELECT 1 FROM invoices WHERE order_id = target_id AND managed = 1 AND status <> 'draft') THEN RAISE EXCEPTION 'Issued billed order lines are immutable'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER managed_order_item_immutable BEFORE INSERT OR UPDATE OR DELETE ON order_items FOR EACH ROW EXECUTE FUNCTION protect_managed_order_item();
--> statement-breakpoint
CREATE FUNCTION protect_managed_payment() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE refunded bigint;
BEGIN
  IF OLD.provider = 'manual' AND EXISTS (SELECT 1 FROM invoices WHERE settled_payment_id = OLD.id AND managed = 1) THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Billed payments cannot be deleted'; END IF;
    IF (to_jsonb(NEW) - ARRAY['status','refunded_amount_cents','updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','refunded_amount_cents','updated_at']) THEN RAISE EXCEPTION 'Billed payment evidence is immutable'; END IF;
    SELECT coalesce(sum(amount_cents), 0) INTO refunded FROM payment_refunds WHERE payment_id = OLD.id AND status = 'processed';
    IF NEW.refunded_amount_cents <> refunded OR NEW.status <> (CASE WHEN refunded = 0 THEN 'succeeded' WHEN refunded = NEW.amount_cents THEN 'refunded' ELSE 'partially_refunded' END) THEN RAISE EXCEPTION 'Manual refund ledger is inconsistent'; END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER managed_payment_immutable BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION protect_managed_payment();
