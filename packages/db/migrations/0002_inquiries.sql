CREATE TABLE "inquiries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "inquiries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"email" text NOT NULL,
	"interest" text NOT NULL,
	"interest_label" text NOT NULL,
	"message" text NOT NULL,
	"privacy_accepted_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"notified_at" timestamp with time zone,
	"notification_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inquiries_status_valid" CHECK ("inquiries"."status" in ('new', 'replied', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "inquiries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE INDEX "inquiries_created_at_idx" ON "inquiries" USING btree ("created_at" DESC NULLS LAST);