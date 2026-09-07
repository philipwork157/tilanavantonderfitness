ALTER TABLE "program_access" DROP CONSTRAINT "program_access_order_item_id_order_items_id_fk";
--> statement-breakpoint
ALTER TABLE "client_nutrition_targets" DROP CONSTRAINT "client_nutrition_targets_checkin_id_client_checkins_id_fk";
--> statement-breakpoint
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_order_id_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_refunds" DROP CONSTRAINT "payment_refunds_payment_id_payments_id_fk";
--> statement-breakpoint
DROP INDEX "client_checkins_client_date_idx";--> statement-breakpoint
DROP INDEX "newsletter_subscribers_email_unique";--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "client_id" integer;--> statement-breakpoint
UPDATE "order_items" AS item
SET "client_id" = "orders"."client_id"
FROM "orders"
WHERE "orders"."id" = item."order_id";--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "order_items" WHERE "client_id" IS NULL) THEN
		RAISE EXCEPTION 'Cannot link order items to clients: one or more orders are missing.';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "client_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refunded_amount_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "client_checkins_id_client_unique" ON "client_checkins" USING btree ("id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_id_client_volume_unique" ON "order_items" USING btree ("id","client_id","program_volume_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_id_client_unique" ON "orders" USING btree ("id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_id_provider_currency_unique" ON "payments" USING btree ("id","provider","currency");--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "newsletter_subscribers" GROUP BY lower("email") HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot enforce unique newsletter email: merge case-insensitive duplicates first.';
	END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_subscribers_email_unique" ON "newsletter_subscribers" USING btree (lower("email"));--> statement-breakpoint
ALTER TABLE "program_access" ADD CONSTRAINT "program_access_order_item_client_volume_fk" FOREIGN KEY ("order_item_id","client_id","program_volume_id") REFERENCES "public"."order_items"("id","client_id","program_volume_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_nutrition_targets" ADD CONSTRAINT "client_nutrition_targets_checkin_client_fk" FOREIGN KEY ("checkin_id","client_id") REFERENCES "public"."client_checkins"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_client_orders_id_client_fk" FOREIGN KEY ("order_id","client_id") REFERENCES "public"."orders"("id","client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_provider_currency_fk" FOREIGN KEY ("payment_id","provider","currency") REFERENCES "public"."payments"("id","provider","currency") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_access" ADD CONSTRAINT "program_access_purchase_has_order_item" CHECK ("program_access"."source" <> 'purchase' or "program_access"."order_item_id" is not null);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_refunded_amount_valid" CHECK ("payments"."refunded_amount_cents" >= 0 and "payments"."refunded_amount_cents" <= "payments"."amount_cents");--> statement-breakpoint
CREATE FUNCTION "public"."enforce_payment_refund_limit"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
	payment_amount integer;
	active_refund_total bigint;
BEGIN
	SELECT "amount_cents"
	INTO payment_amount
	FROM "payments"
	WHERE "id" = NEW."payment_id"
	FOR UPDATE;

	SELECT COALESCE(SUM("amount_cents"), 0)
	INTO active_refund_total
	FROM "payment_refunds"
	WHERE "payment_id" = NEW."payment_id"
		AND "status" <> 'failed';

	IF active_refund_total > payment_amount THEN
		RAISE EXCEPTION 'Active refunds cannot exceed the original payment amount.'
			USING ERRCODE = '23514';
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "payment_refunds_limit_trigger"
AFTER INSERT OR UPDATE OF "payment_id", "amount_cents", "status"
ON "payment_refunds"
FOR EACH ROW
EXECUTE FUNCTION "public"."enforce_payment_refund_limit"();
