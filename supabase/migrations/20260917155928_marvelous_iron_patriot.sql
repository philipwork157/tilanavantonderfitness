CREATE TABLE "invoice_processing_jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "invoice_processing_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_id" integer NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"review_required" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_processing_values_valid" CHECK ("invoice_processing_jobs"."attempts" >= 0 and "invoice_processing_jobs"."review_required" in (0, 1))
);
--> statement-breakpoint
ALTER TABLE "invoice_processing_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_purchase_settlement_present";--> statement-breakpoint
ALTER TABLE "invoice_processing_jobs" ADD CONSTRAINT "invoice_processing_jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_processing_order_unique" ON "invoice_processing_jobs" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_purchase_settlement_present" CHECK ("invoices"."source" <> 'purchase' or ("invoices"."order_id" is not null and "invoices"."settled_payment_id" is not null and "invoices"."status" in ('draft', 'paid') and "invoices"."tax_cents" = 0 and "invoices"."seller_tax_number" is null));
--> statement-breakpoint
-- External document numbers intentionally permit gaps after transaction rollback.
CREATE SEQUENCE billing_document_number AS bigint;
--> statement-breakpoint
SELECT setval('billing_document_number', greatest(1, coalesce((SELECT max(substring(invoice_number from '^TVT-INV-([0-9]{1,12})$')::bigint) FROM invoices), 0) + 1), false);
--> statement-breakpoint
CREATE FUNCTION protect_purchase_invoice() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.source = 'purchase' AND OLD.status <> 'draft' THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Issued purchase invoices cannot be deleted'; END IF;
    IF (to_jsonb(NEW) - ARRAY['reconciled_at','pdf_r2_bucket','pdf_r2_object_key','updated_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['reconciled_at','pdf_r2_bucket','pdf_r2_object_key','updated_at']) THEN
      RAISE EXCEPTION 'Issued purchase invoice snapshots are immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER purchase_invoice_immutable BEFORE UPDATE OR DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION protect_purchase_invoice();
--> statement-breakpoint
CREATE FUNCTION protect_purchase_invoice_item() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE target_id integer; target invoices%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN target_id := NEW.invoice_id; ELSE target_id := OLD.invoice_id; END IF;
  SELECT * INTO target FROM invoices WHERE id = target_id FOR UPDATE;
  IF target.source = 'purchase' AND target.status <> 'draft' THEN RAISE EXCEPTION 'Issued invoice lines are immutable'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.invoice_id <> OLD.invoice_id THEN RAISE EXCEPTION 'Invoice lines cannot move'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER purchase_invoice_item_immutable BEFORE INSERT OR UPDATE OR DELETE ON invoice_items FOR EACH ROW EXECUTE FUNCTION protect_purchase_invoice_item();
--> statement-breakpoint
CREATE FUNCTION validate_purchase_invoice() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE target invoices%ROWTYPE; settlement payments%ROWTYPE; purchase orders%ROWTYPE; lines bigint;
BEGIN
  SELECT * INTO target FROM invoices WHERE id = NEW.id;
  IF target.source <> 'purchase' THEN RETURN NULL; END IF;
  SELECT * INTO settlement FROM payments WHERE id = target.settled_payment_id;
  SELECT * INTO purchase FROM orders WHERE id = target.order_id;
  SELECT sum(line_total_cents) INTO lines FROM invoice_items WHERE invoice_id = target.id;
  IF target.status <> 'paid' OR target.paid_at IS NULL OR target.issued_at IS NULL OR target.issue_date IS NULL
    OR settlement.order_id <> target.order_id OR settlement.currency <> target.currency
    OR settlement.amount_cents <> target.total_cents OR settlement.paid_at IS NULL
    OR settlement.status NOT IN ('succeeded','partially_refunded','refunded','reversed')
    OR purchase.client_id <> target.client_id OR purchase.currency <> target.currency
    OR purchase.total_cents <> target.total_cents OR lines IS DISTINCT FROM target.subtotal_cents::bigint THEN
    RAISE EXCEPTION 'Purchase invoice settlement or line totals are inconsistent';
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER purchase_invoice_consistent AFTER INSERT OR UPDATE ON invoices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_purchase_invoice();
--> statement-breakpoint
CREATE FUNCTION validate_invoice_credit() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE target invoices%ROWTYPE; settlement payments%ROWTYPE; refund payment_refunds%ROWTYPE; credited bigint;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Issued credit notes are immutable'; END IF;
  SELECT * INTO target FROM invoices WHERE id = NEW.invoice_id FOR UPDATE;
  SELECT * INTO settlement FROM payments WHERE id = NEW.payment_id;
  IF target.source <> 'purchase' OR target.status <> 'paid' OR target.settled_payment_id <> NEW.payment_id THEN
    RAISE EXCEPTION 'Credit note payment does not match invoice';
  END IF;
  IF NEW.reason = 'refund' THEN
    SELECT * INTO refund FROM payment_refunds WHERE id = NEW.refund_id;
    IF refund.payment_id <> NEW.payment_id OR refund.status <> 'processed' OR refund.currency <> target.currency
       OR refund.amount_cents <> NEW.amount_cents OR NEW.source_key <> 'refund:' || NEW.refund_id::text THEN
      RAISE EXCEPTION 'Credit note refund evidence is inconsistent';
    END IF;
  ELSIF settlement.status <> 'reversed' OR NEW.source_key <> 'reversal:' || NEW.payment_id::text THEN
    RAISE EXCEPTION 'Credit note reversal evidence is inconsistent';
  END IF;
  SELECT coalesce(sum(amount_cents), 0) INTO credited FROM invoice_credits WHERE invoice_id = target.id;
  IF credited + NEW.amount_cents > target.total_cents THEN RAISE EXCEPTION 'Invoice credit overage'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER invoice_credit_consistent BEFORE INSERT OR UPDATE OR DELETE ON invoice_credits FOR EACH ROW EXECUTE FUNCTION validate_invoice_credit();
--> statement-breakpoint
CREATE FUNCTION validate_invoice_delivery() RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.credit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM invoice_credits WHERE id = NEW.credit_id AND invoice_id = NEW.invoice_id) THEN
    RAISE EXCEPTION 'Invoice delivery credit belongs to another invoice';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.invoice_id IS DISTINCT FROM OLD.invoice_id OR NEW.credit_id IS DISTINCT FROM OLD.credit_id) THEN
    RAISE EXCEPTION 'Invoice delivery target is immutable';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER invoice_delivery_consistent BEFORE INSERT OR UPDATE ON invoice_deliveries FOR EACH ROW EXECUTE FUNCTION validate_invoice_delivery();
