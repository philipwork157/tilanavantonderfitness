CREATE TABLE "payment_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"payment_id" integer,
	"provider" text NOT NULL,
	"provider_event_key" text NOT NULL,
	"event_type" text NOT NULL,
	"processing_status" text DEFAULT 'received' NOT NULL,
	"payload" jsonb NOT NULL,
	"error_message" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "payment_events_provider_length" CHECK (char_length("payment_events"."provider") between 1 and 50),
	CONSTRAINT "payment_events_key_length" CHECK (char_length("payment_events"."provider_event_key") between 1 and 240),
	CONSTRAINT "payment_events_type_length" CHECK (char_length("payment_events"."event_type") between 1 and 120),
	CONSTRAINT "payment_events_processing_status_value" CHECK ("payment_events"."processing_status" in ('received', 'processed', 'ignored', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "payment_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payment_refunds" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_refunds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"payment_id" integer NOT NULL,
	"provider" text DEFAULT 'paystack' NOT NULL,
	"provider_refund_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"customer_note" text,
	"merchant_note" text,
	"requested_by_user_id" integer,
	"expected_at" timestamp with time zone,
	"refunded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_refunds_provider_length" CHECK (char_length("payment_refunds"."provider") between 1 and 50),
	CONSTRAINT "payment_refunds_status_value" CHECK ("payment_refunds"."status" in ('pending', 'processing', 'processed', 'failed', 'needs-attention')),
	CONSTRAINT "payment_refunds_amount_positive" CHECK ("payment_refunds"."amount_cents" > 0),
	CONSTRAINT "payment_refunds_currency_format" CHECK ("payment_refunds"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "payment_refunds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_status_value";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_transaction_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "provider_status" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "environment" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "access_code" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "checkout_url" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "gateway_response" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "failure_message" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "fees_cents" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_key_unique" ON "payment_events" USING btree ("provider","provider_event_key");--> statement-breakpoint
CREATE INDEX "payment_events_payment_received_at_idx" ON "payment_events" USING btree ("payment_id","received_at");--> statement-breakpoint
CREATE INDEX "payment_events_processing_received_at_idx" ON "payment_events" USING btree ("processing_status","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_refunds_provider_id_unique" ON "payment_refunds" USING btree ("provider","provider_refund_id") WHERE "payment_refunds"."provider_refund_id" is not null;--> statement-breakpoint
CREATE INDEX "payment_refunds_payment_created_at_idx" ON "payment_refunds" USING btree ("payment_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_refunds_status_updated_at_idx" ON "payment_refunds" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_transaction_unique" ON "payments" USING btree ("provider","provider_transaction_id") WHERE "payments"."provider_transaction_id" is not null;--> statement-breakpoint
CREATE INDEX "payments_status_updated_at_idx" ON "payments" USING btree ("status","updated_at");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_provider_length" CHECK (char_length("payments"."provider") between 1 and 50);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_environment_value" CHECK ("payments"."environment" is null or "payments"."environment" in ('test', 'live'));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_paystack_fields_present" CHECK ("payments"."provider" <> 'paystack' or ("payments"."provider_reference" is not null and "payments"."environment" is not null));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_paystack_reference_format" CHECK ("payments"."provider" <> 'paystack' or "payments"."provider_reference" ~ '^[A-Za-z0-9.=-]+$');--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_fees_non_negative" CHECK ("payments"."fees_cents" is null or "payments"."fees_cents" >= 0);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_status_value" CHECK ("payments"."status" in ('pending', 'succeeded', 'failed', 'abandoned', 'reversed', 'partially_refunded', 'refunded'));