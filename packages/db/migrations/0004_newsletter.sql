CREATE TABLE "newsletter_campaigns" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "newsletter_campaigns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"blog_post_id" bigint,
	"subject" text NOT NULL,
	"preview_text" text DEFAULT '' NOT NULL,
	"introduction" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"test_sent_at" timestamp with time zone,
	"pause_reason" text,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_by" bigint,
	"sent_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_campaigns_status_valid" CHECK ("newsletter_campaigns"."status" in ('draft', 'sending', 'paused', 'sent'))
);
--> statement-breakpoint
ALTER TABLE "newsletter_campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "newsletter_deliveries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "newsletter_deliveries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"campaign_id" bigint NOT NULL,
	"subscriber_id" bigint,
	"email" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"ses_message_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_deliveries_status_valid" CHECK ("newsletter_deliveries"."status" in ('queued', 'sending', 'sent', 'skipped', 'failed', 'bounced', 'complained'))
);
--> statement-breakpoint
ALTER TABLE "newsletter_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "newsletter_subscribers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "newsletter_subscribers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text NOT NULL,
	"consented_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"suppressed_at" timestamp with time zone,
	"suppression_reason" text,
	"confirmation_token_hash" text,
	"confirmation_expires_at" timestamp with time zone,
	"confirmation_sent_at" timestamp with time zone,
	"unsubscribe_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_subscribers_email_unique" UNIQUE("email"),
	CONSTRAINT "newsletter_subscribers_confirmation_token_hash_unique" UNIQUE("confirmation_token_hash"),
	CONSTRAINT "newsletter_subscribers_unsubscribe_token_unique" UNIQUE("unsubscribe_token"),
	CONSTRAINT "newsletter_subscribers_email_lowercase" CHECK ("newsletter_subscribers"."email" = lower("newsletter_subscribers"."email")),
	CONSTRAINT "newsletter_subscribers_status_valid" CHECK ("newsletter_subscribers"."status" in ('pending', 'subscribed', 'unsubscribed', 'bounced', 'complained'))
);
--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "newsletter_campaigns" ADD CONSTRAINT "newsletter_campaigns_blog_post_id_blog_posts_id_fk" FOREIGN KEY ("blog_post_id") REFERENCES "public"."blog_posts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_campaigns" ADD CONSTRAINT "newsletter_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_campaigns" ADD CONSTRAINT "newsletter_campaigns_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_deliveries" ADD CONSTRAINT "newsletter_deliveries_campaign_id_newsletter_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."newsletter_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "newsletter_deliveries" ADD CONSTRAINT "newsletter_deliveries_subscriber_id_newsletter_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."newsletter_subscribers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "newsletter_campaigns_created_at_idx" ON "newsletter_campaigns" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_deliveries_campaign_subscriber_unique" ON "newsletter_deliveries" USING btree ("campaign_id","subscriber_id");--> statement-breakpoint
CREATE INDEX "newsletter_deliveries_campaign_status_idx" ON "newsletter_deliveries" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "newsletter_deliveries_ses_message_idx" ON "newsletter_deliveries" USING btree ("ses_message_id");--> statement-breakpoint
CREATE INDEX "newsletter_subscribers_status_idx" ON "newsletter_subscribers" USING btree ("status");