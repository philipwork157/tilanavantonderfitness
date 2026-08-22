CREATE TABLE "newsletter_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"source" text DEFAULT 'website-footer' NOT NULL,
	"privacy_policy_version" text NOT NULL,
	"consented_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_subscribers_email_length" CHECK (char_length("newsletter_subscribers"."email") between 3 and 254),
	CONSTRAINT "newsletter_subscribers_source_length" CHECK (char_length("newsletter_subscribers"."source") between 1 and 80),
	CONSTRAINT "newsletter_subscribers_status_value" CHECK ("newsletter_subscribers"."status" in ('pending', 'subscribed', 'unsubscribed', 'bounced', 'complained'))
);
--> statement-breakpoint
ALTER TABLE "newsletter_subscribers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "newsletter_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "newsletter_tokens_purpose_value" CHECK ("newsletter_tokens"."purpose" in ('confirmation', 'unsubscribe')),
	CONSTRAINT "newsletter_tokens_expiry_valid" CHECK ("newsletter_tokens"."expires_at" > "newsletter_tokens"."created_at")
);
--> statement-breakpoint
ALTER TABLE "newsletter_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "newsletter_tokens" ADD CONSTRAINT "newsletter_tokens_subscriber_id_newsletter_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."newsletter_subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_subscribers_email_unique" ON "newsletter_subscribers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "newsletter_subscribers_status_created_at_idx" ON "newsletter_subscribers" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "newsletter_tokens_hash_unique" ON "newsletter_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "newsletter_tokens_subscriber_purpose_idx" ON "newsletter_tokens" USING btree ("subscriber_id","purpose");