CREATE TABLE "newsletter_campaign_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"email_snapshot" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"ses_message_id" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_campaign_deliveries_status_value" CHECK ("newsletter_campaign_deliveries"."status" in ('queued', 'sent', 'failed', 'skipped')),
	CONSTRAINT "newsletter_campaign_deliveries_email_length" CHECK (char_length("newsletter_campaign_deliveries"."email_snapshot") between 3 and 254),
	CONSTRAINT "newsletter_campaign_deliveries_attempts_valid" CHECK ("newsletter_campaign_deliveries"."attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "newsletter_campaign_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "newsletter_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" text NOT NULL,
	"preview_text" text,
	"blog_title" text NOT NULL,
	"introduction" text NOT NULL,
	"blog_url" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by_user_id" uuid,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_campaigns_status_value" CHECK ("newsletter_campaigns"."status" in ('draft', 'sending', 'sent', 'partially_failed', 'failed')),
	CONSTRAINT "newsletter_campaigns_subject_length" CHECK (char_length("newsletter_campaigns"."subject") between 3 and 150),
	CONSTRAINT "newsletter_campaigns_blog_title_length" CHECK (char_length("newsletter_campaigns"."blog_title") between 2 and 160),
	CONSTRAINT "newsletter_campaigns_blog_url_length" CHECK (char_length("newsletter_campaigns"."blog_url") between 8 and 500),
	CONSTRAINT "newsletter_campaigns_counts_valid" CHECK ("newsletter_campaigns"."recipient_count" >= 0 and "newsletter_campaigns"."sent_count" >= 0 and "newsletter_campaigns"."failed_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "newsletter_campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "newsletter_campaign_deliveries" ADD CONSTRAINT "newsletter_campaign_deliveries_campaign_id_newsletter_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."newsletter_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_campaign_deliveries" ADD CONSTRAINT "newsletter_campaign_deliveries_subscriber_id_newsletter_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."newsletter_subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_campaigns" ADD CONSTRAINT "newsletter_campaigns_created_by_user_id_profiles_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_campaign_deliveries_campaign_subscriber_unique" ON "newsletter_campaign_deliveries" USING btree ("campaign_id","subscriber_id");--> statement-breakpoint
CREATE INDEX "newsletter_campaign_deliveries_campaign_status_idx" ON "newsletter_campaign_deliveries" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "newsletter_campaign_deliveries_subscriber_idx" ON "newsletter_campaign_deliveries" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "newsletter_campaigns_status_created_at_idx" ON "newsletter_campaigns" USING btree ("status","created_at");