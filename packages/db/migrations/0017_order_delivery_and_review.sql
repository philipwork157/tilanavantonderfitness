ALTER TABLE "orders" ADD COLUMN "delivery_message_ids" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "reviewed_at" timestamp with time zone;