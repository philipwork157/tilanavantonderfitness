DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "clients" GROUP BY lower("email") HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Cannot enforce unique client email: merge duplicate case-insensitive client records first.';
	END IF;
END $$;--> statement-breakpoint
DROP INDEX "clients_email_idx";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_email" text;--> statement-breakpoint
CREATE UNIQUE INDEX "clients_email_unique" ON "clients" USING btree (lower("email"));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_email_length" CHECK ("orders"."customer_email" is null or char_length("orders"."customer_email") between 3 and 254);
