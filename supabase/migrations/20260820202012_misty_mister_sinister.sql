CREATE TABLE "contact_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"interest" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"source" text DEFAULT 'website' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_submissions_full_name_length" CHECK (char_length("contact_submissions"."full_name") between 2 and 100),
	CONSTRAINT "contact_submissions_email_length" CHECK (char_length("contact_submissions"."email") between 3 and 254),
	CONSTRAINT "contact_submissions_message_length" CHECK (char_length("contact_submissions"."message") between 10 and 3000),
	CONSTRAINT "contact_submissions_interest_value" CHECK ("contact_submissions"."interest" in ('strong', 'move', 'nourish', 'reconnect', 'one-on-one', 'general')),
	CONSTRAINT "contact_submissions_status_value" CHECK ("contact_submissions"."status" in ('new', 'read', 'replied', 'archived'))
);
--> statement-breakpoint
CREATE INDEX "contact_submissions_status_created_at_idx" ON "contact_submissions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "contact_submissions_email_idx" ON "contact_submissions" USING btree ("email");