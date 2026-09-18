CREATE TABLE "invoice_credits" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "invoice_credits_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"invoice_id" integer NOT NULL,
	"payment_id" integer NOT NULL,
	"refund_id" integer,
	"credit_number" text NOT NULL,
	"source_key" text NOT NULL,
	"reason" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_credits_amount_positive" CHECK ("invoice_credits"."amount_cents" > 0),
	CONSTRAINT "invoice_credits_reason_valid" CHECK (("invoice_credits"."reason" = 'refund' and "invoice_credits"."refund_id" is not null) or ("invoice_credits"."reason" = 'reversal' and "invoice_credits"."refund_id" is null))
);
--> statement-breakpoint
ALTER TABLE "invoice_credits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoice_deliveries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "invoice_deliveries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"invoice_id" integer NOT NULL,
	"credit_id" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_version" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "invoice_deliveries_attempts_valid" CHECK ("invoice_deliveries"."attempts" >= 0 and "invoice_deliveries"."lease_version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "invoice_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "settled_payment_id" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "reconciled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "customer_phone" text;--> statement-breakpoint
ALTER TABLE "invoice_credits" ADD CONSTRAINT "invoice_credits_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_credits" ADD CONSTRAINT "invoice_credits_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_credits" ADD CONSTRAINT "invoice_credits_refund_id_payment_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."payment_refunds"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_deliveries" ADD CONSTRAINT "invoice_deliveries_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_deliveries" ADD CONSTRAINT "invoice_deliveries_credit_id_invoice_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."invoice_credits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_credits_number_unique" ON "invoice_credits" USING btree ("credit_number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_credits_source_unique" ON "invoice_credits" USING btree ("source_key");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_credits_refund_unique" ON "invoice_credits" USING btree ("refund_id");--> statement-breakpoint
CREATE INDEX "invoice_credits_invoice_idx" ON "invoice_credits" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_deliveries_invoice_unique" ON "invoice_deliveries" USING btree ("invoice_id") WHERE "invoice_deliveries"."credit_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_deliveries_credit_unique" ON "invoice_deliveries" USING btree ("credit_id");--> statement-breakpoint
CREATE INDEX "invoice_deliveries_due_idx" ON "invoice_deliveries" USING btree ("next_attempt_at");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_settled_payment_id_payments_id_fk" FOREIGN KEY ("settled_payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_client_fk" FOREIGN KEY ("order_id","client_id") REFERENCES "public"."orders"("id","client_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_purchase_order_unique" ON "invoices" USING btree ("order_id") WHERE "invoices"."source" = 'purchase';--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_source_valid" CHECK ("invoices"."source" in ('manual', 'purchase'));--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_purchase_settlement_present" CHECK ("invoices"."source" <> 'purchase' or ("invoices"."order_id" is not null and "invoices"."settled_payment_id" is not null and "invoices"."status" = 'paid' and "invoices"."paid_at" is not null and "invoices"."tax_cents" = 0 and "invoices"."seller_tax_number" is null));