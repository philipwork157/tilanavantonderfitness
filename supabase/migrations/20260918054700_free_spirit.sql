CREATE TABLE "invoice_commands" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "invoice_commands_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key_hash" text NOT NULL,
	"request_hash" text NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"invoice_id" integer,
	"edition_id" integer,
	"order_id" integer,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_commands_hashes_valid" CHECK ("invoice_commands"."key_hash" ~ '^[a-f0-9]{64}$' and "invoice_commands"."request_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "invoice_commands" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoice_editions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "invoice_editions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"invoice_id" integer NOT NULL,
	"client_name" text NOT NULL,
	"client_address" text,
	"client_phone" text,
	"reason" text NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_editions_reason_length" CHECK (char_length("invoice_editions"."reason") between 5 and 1000),
	CONSTRAINT "invoice_editions_name_length" CHECK (char_length("invoice_editions"."client_name") between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "invoice_editions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoice_purchase_reviews" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "invoice_purchase_reviews_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"order_id" integer NOT NULL,
	"payment_id" integer NOT NULL,
	"client_name" text NOT NULL,
	"client_email" text NOT NULL,
	"client_phone" text,
	"evidence" text NOT NULL,
	"created_by_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_purchase_reviews_evidence_length" CHECK (char_length("invoice_purchase_reviews"."evidence") between 10 and 1000)
);
--> statement-breakpoint
ALTER TABLE "invoice_purchase_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "invoice_deliveries_invoice_unique";--> statement-breakpoint
ALTER TABLE "invoice_deliveries" ADD COLUMN "edition_id" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "managed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "replaces_invoice_id" integer;--> statement-breakpoint
ALTER TABLE "invoice_commands" ADD CONSTRAINT "invoice_commands_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_commands" ADD CONSTRAINT "invoice_commands_edition_id_invoice_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."invoice_editions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_commands" ADD CONSTRAINT "invoice_commands_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_commands" ADD CONSTRAINT "invoice_commands_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_editions" ADD CONSTRAINT "invoice_editions_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_editions" ADD CONSTRAINT "invoice_editions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_purchase_reviews" ADD CONSTRAINT "invoice_purchase_reviews_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_purchase_reviews" ADD CONSTRAINT "invoice_purchase_reviews_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_purchase_reviews" ADD CONSTRAINT "invoice_purchase_reviews_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_commands_key_unique" ON "invoice_commands" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "invoice_editions_invoice_idx" ON "invoice_editions" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_purchase_reviews_order_unique" ON "invoice_purchase_reviews" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "invoice_deliveries" ADD CONSTRAINT "invoice_deliveries_edition_id_invoice_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."invoice_editions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_replaces_invoice_id_invoices_id_fk" FOREIGN KEY ("replaces_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_deliveries_edition_unique" ON "invoice_deliveries" USING btree ("edition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_replacement_unique" ON "invoices" USING btree ("replaces_invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_deliveries_invoice_unique" ON "invoice_deliveries" USING btree ("invoice_id") WHERE "invoice_deliveries"."credit_id" is null and "invoice_deliveries"."edition_id" is null;--> statement-breakpoint
ALTER TABLE "invoice_deliveries" ADD CONSTRAINT "invoice_deliveries_single_document" CHECK ("invoice_deliveries"."credit_id" is null or "invoice_deliveries"."edition_id" is null);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_managed_valid" CHECK ("invoices"."managed" in (0, 1));