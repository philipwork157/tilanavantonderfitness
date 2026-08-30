CREATE TABLE "newsletter_campaign_test_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"recipient_snapshot" text NOT NULL,
	"status" text NOT NULL,
	"ses_message_id" text,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_campaign_test_deliveries_status_value" CHECK ("newsletter_campaign_test_deliveries"."status" in ('sent', 'failed')),
	CONSTRAINT "newsletter_campaign_test_deliveries_recipient_length" CHECK (char_length("newsletter_campaign_test_deliveries"."recipient_snapshot") between 3 and 254)
);
--> statement-breakpoint
ALTER TABLE "newsletter_campaign_test_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "newsletter_campaign_test_deliveries" ADD CONSTRAINT "newsletter_campaign_test_deliveries_campaign_id_newsletter_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."newsletter_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "newsletter_campaign_test_deliveries_campaign_created_idx" ON "newsletter_campaign_test_deliveries" USING btree ("campaign_id","created_at");