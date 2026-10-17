DROP TABLE "program_volumes" CASCADE;--> statement-breakpoint
ALTER TABLE "programs" DROP CONSTRAINT "programs_status_valid";--> statement-breakpoint
ALTER TABLE "programs" DROP CONSTRAINT "programs_published_has_date";--> statement-breakpoint
DROP INDEX "programs_status_order_idx";--> statement-breakpoint
ALTER TABLE "programs" ALTER COLUMN "volume_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ALTER COLUMN "price_cents" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "programs_volume_order_idx" ON "programs" USING btree ("volume_id","sort_order");--> statement-breakpoint
ALTER TABLE "programs" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "programs" DROP COLUMN "published_at";--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_price_valid" CHECK ("programs"."price_cents" between 100 and 10000000);--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_currency_valid" CHECK ("programs"."currency" = 'ZAR');--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_file_complete" CHECK (("programs"."file_path" is null) = ("programs"."file_name" is null)
    and ("programs"."file_path" is null) = ("programs"."file_size_bytes" is null)
    and ("programs"."file_path" is null) = ("programs"."file_sha256" is null)
    and ("programs"."file_path" is null) = ("programs"."file_uploaded_at" is null));