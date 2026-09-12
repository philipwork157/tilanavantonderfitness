CREATE TABLE "program_audit_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "program_audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"action" text NOT NULL,
	"change_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_audit_events_entity_type_value" CHECK ("program_audit_events"."entity_type" in ('program', 'program_volume', 'program_media', 'program_file')),
	CONSTRAINT "program_audit_events_entity_id_positive" CHECK ("program_audit_events"."entity_id" > 0),
	CONSTRAINT "program_audit_events_action_format" CHECK ("program_audit_events"."action" ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$' and char_length("program_audit_events"."action") <= 80),
	CONSTRAINT "program_audit_events_summary_object" CHECK (jsonb_typeof("program_audit_events"."change_summary") = 'object')
);
--> statement-breakpoint
ALTER TABLE "program_audit_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "program_media" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "program_media_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"program_id" integer NOT NULL,
	"kind" text DEFAULT 'cover' NOT NULL,
	"display_name" text NOT NULL,
	"alt_text" text NOT NULL,
	"r2_bucket" text NOT NULL,
	"r2_object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer,
	"width" integer,
	"height" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"upload_status" text DEFAULT 'pending' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_media_kind_value" CHECK ("program_media"."kind" in ('cover')),
	CONSTRAINT "program_media_display_name_length" CHECK (char_length("program_media"."display_name") between 1 and 200),
	CONSTRAINT "program_media_alt_text_length" CHECK (char_length("program_media"."alt_text") between 1 and 300),
	CONSTRAINT "program_media_bucket_length" CHECK (char_length("program_media"."r2_bucket") between 1 and 100),
	CONSTRAINT "program_media_object_key_length" CHECK (char_length("program_media"."r2_object_key") between 1 and 1024),
	CONSTRAINT "program_media_content_type_length" CHECK (char_length("program_media"."content_type") between 1 and 120),
	CONSTRAINT "program_media_size_non_negative" CHECK ("program_media"."size_bytes" is null or "program_media"."size_bytes" >= 0),
	CONSTRAINT "program_media_dimensions_valid" CHECK (("program_media"."width" is null and "program_media"."height" is null) or ("program_media"."width" is not null and "program_media"."height" is not null and "program_media"."width" > 0 and "program_media"."height" > 0)),
	CONSTRAINT "program_media_version_positive" CHECK ("program_media"."version" > 0),
	CONSTRAINT "program_media_sort_order_non_negative" CHECK ("program_media"."sort_order" >= 0),
	CONSTRAINT "program_media_upload_status_value" CHECK ("program_media"."upload_status" in ('pending', 'ready', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "program_media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP INDEX "program_files_volume_active_idx";--> statement-breakpoint
ALTER TABLE "program_files" ADD COLUMN "original_filename" text;--> statement-breakpoint
-- Existing file metadata remains pending until Phase 3 verifies that its R2
-- object exists. New uploads also begin pending and are finalized by the server.
ALTER TABLE "program_files" ADD COLUMN "upload_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "program_files" ADD COLUMN "etag" text;--> statement-breakpoint
ALTER TABLE "program_files" ADD COLUMN "uploaded_by_user_id" integer;--> statement-breakpoint
-- Slugs are nullable only for the migration window. Phase 3 backfills stable,
-- unique checkout slugs before database-backed catalogue reads are enabled.
ALTER TABLE "program_volumes" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "program_volumes" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "program_volumes" ADD COLUMN "created_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "program_volumes" ADD COLUMN "updated_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "card_label" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "headline" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "accent" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "created_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "updated_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "program_audit_events" ADD CONSTRAINT "program_audit_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_media" ADD CONSTRAINT "program_media_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_media" ADD CONSTRAINT "program_media_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "program_audit_events_entity_created_at_idx" ON "program_audit_events" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "program_audit_events_user_created_at_idx" ON "program_audit_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "program_media_r2_object_unique" ON "program_media" USING btree ("r2_bucket","r2_object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "program_media_program_ready_cover_unique" ON "program_media" USING btree ("program_id","kind") WHERE "program_media"."kind" = 'cover' and "program_media"."upload_status" = 'ready' and "program_media"."is_active" = true;--> statement-breakpoint
CREATE INDEX "program_media_program_status_order_idx" ON "program_media" USING btree ("program_id","upload_status","is_active","sort_order");--> statement-breakpoint
ALTER TABLE "program_files" ADD CONSTRAINT "program_files_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_volumes" ADD CONSTRAINT "program_volumes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_volumes" ADD CONSTRAINT "program_volumes_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "program_files_volume_ready_active_idx" ON "program_files" USING btree ("program_volume_id","upload_status","is_active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "program_volumes_slug_unique" ON "program_volumes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "program_volumes_program_published_order_idx" ON "program_volumes" USING btree ("program_id","is_published","sort_order");--> statement-breakpoint
CREATE INDEX "programs_catalogue_order_idx" ON "programs" USING btree ("status","sort_order","name");--> statement-breakpoint
ALTER TABLE "program_files" ADD CONSTRAINT "program_files_original_filename_length" CHECK ("program_files"."original_filename" is null or char_length("program_files"."original_filename") between 1 and 255);--> statement-breakpoint
ALTER TABLE "program_files" ADD CONSTRAINT "program_files_bucket_length" CHECK (char_length("program_files"."r2_bucket") between 1 and 100);--> statement-breakpoint
ALTER TABLE "program_files" ADD CONSTRAINT "program_files_object_key_length" CHECK (char_length("program_files"."r2_object_key") between 1 and 1024);--> statement-breakpoint
ALTER TABLE "program_files" ADD CONSTRAINT "program_files_content_type_length" CHECK (char_length("program_files"."content_type") between 1 and 120);--> statement-breakpoint
ALTER TABLE "program_files" ADD CONSTRAINT "program_files_upload_status_value" CHECK ("program_files"."upload_status" in ('pending', 'ready', 'failed'));--> statement-breakpoint
ALTER TABLE "program_files" ADD CONSTRAINT "program_files_etag_length" CHECK ("program_files"."etag" is null or char_length("program_files"."etag") between 1 and 200);--> statement-breakpoint
ALTER TABLE "program_files" ADD CONSTRAINT "program_files_sort_order_non_negative" CHECK ("program_files"."sort_order" >= 0);--> statement-breakpoint
ALTER TABLE "program_volumes" ADD CONSTRAINT "program_volumes_slug_format" CHECK ("program_volumes"."slug" is null or "program_volumes"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');--> statement-breakpoint
ALTER TABLE "program_volumes" ADD CONSTRAINT "program_volumes_sort_order_non_negative" CHECK ("program_volumes"."sort_order" >= 0);--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_card_label_length" CHECK ("programs"."card_label" is null or char_length("programs"."card_label") between 1 and 120);--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_headline_length" CHECK ("programs"."headline" is null or char_length("programs"."headline") between 1 and 180);--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_accent_format" CHECK ("programs"."accent" is null or ("programs"."accent" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length("programs"."accent") <= 40));--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_sort_order_non_negative" CHECK ("programs"."sort_order" >= 0);
