ALTER TABLE "orders" DROP CONSTRAINT "orders_status_valid";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "check_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "sale_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refund_status" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refund_reason" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paystack_refund_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refund_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_refund_status_valid" CHECK ("orders"."refund_status" is null or "orders"."refund_status" in ('pending', 'processed', 'failed'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_refunded_has_date" CHECK ("orders"."status" <> 'refunded' or "orders"."refunded_at" is not null);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_status_valid" CHECK ("orders"."status" in ('pending', 'paid', 'failed', 'abandoned', 'refunded'));--> statement-breakpoint
-- Orders paid before this migration already had their delivery attempt and "New sale" email.
UPDATE "orders" SET "sale_notified_at" = "paid_at", "delivery_attempts" = 1 WHERE "status" = 'paid' AND "delivery_status" <> 'pending';
