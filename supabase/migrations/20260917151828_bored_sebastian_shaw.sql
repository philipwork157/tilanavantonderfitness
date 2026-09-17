CREATE TABLE "payment_disputes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_disputes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"payment_id" integer NOT NULL,
	"provider_dispute_id" text NOT NULL,
	"provider_status" text NOT NULL,
	"resolution" text,
	"amount_cents" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_disputes_amount_valid" CHECK ("payment_disputes"."amount_cents" is null or "payment_disputes"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "payment_disputes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payment_recovery_jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payment_recovery_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"payment_id" integer NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"lease_version" integer DEFAULT 0 NOT NULL,
	"review_reason" text,
	"alert_pending" boolean DEFAULT false NOT NULL,
	"alerted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_recovery_jobs_counters_valid" CHECK ("payment_recovery_jobs"."attempts" >= 0 and "payment_recovery_jobs"."lease_version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "payment_recovery_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_recovery_jobs" ADD CONSTRAINT "payment_recovery_jobs_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_disputes_provider_id_unique" ON "payment_disputes" USING btree ("provider_dispute_id");--> statement-breakpoint
CREATE INDEX "payment_disputes_payment_idx" ON "payment_disputes" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_recovery_jobs_payment_unique" ON "payment_recovery_jobs" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_recovery_jobs_due_idx" ON "payment_recovery_jobs" USING btree ("next_attempt_at");