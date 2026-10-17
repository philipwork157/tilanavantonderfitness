CREATE TABLE "program_volumes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "program_volumes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"program_id" bigint NOT NULL,
	"slug" text NOT NULL,
	"volume_number" smallint NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"is_available" boolean DEFAULT false NOT NULL,
	"file_path" text,
	"file_name" text,
	"file_size_bytes" integer,
	"file_sha256" text,
	"file_version" integer DEFAULT 0 NOT NULL,
	"file_uploaded_at" timestamp with time zone,
	"file_uploaded_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_volumes_slug_unique" UNIQUE("slug"),
	CONSTRAINT "program_volumes_slug_format" CHECK ("program_volumes"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "program_volumes_number_positive" CHECK ("program_volumes"."volume_number" between 1 and 99),
	CONSTRAINT "program_volumes_name_length" CHECK (char_length("program_volumes"."name") between 1 and 120),
	CONSTRAINT "program_volumes_price_valid" CHECK ("program_volumes"."price_cents" between 100 and 10000000),
	CONSTRAINT "program_volumes_currency_valid" CHECK ("program_volumes"."currency" = 'ZAR'),
	CONSTRAINT "program_volumes_file_complete" CHECK (("program_volumes"."file_path" is null) = ("program_volumes"."file_name" is null)
    and ("program_volumes"."file_path" is null) = ("program_volumes"."file_size_bytes" is null)
    and ("program_volumes"."file_path" is null) = ("program_volumes"."file_sha256" is null)
    and ("program_volumes"."file_path" is null) = ("program_volumes"."file_uploaded_at" is null)),
	CONSTRAINT "program_volumes_available_has_file" CHECK (not "program_volumes"."is_available" or "program_volumes"."file_path" is not null)
);
--> statement-breakpoint
ALTER TABLE "program_volumes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "programs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "programs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"audience" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"tone" text DEFAULT 'sand' NOT NULL,
	"illustration" text DEFAULT 'barbell' NOT NULL,
	"series" text DEFAULT 'focus' NOT NULL,
	"step" smallint,
	"marker" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_by" bigint,
	"updated_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programs_slug_unique" UNIQUE("slug"),
	CONSTRAINT "programs_slug_format" CHECK ("programs"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "programs_name_length" CHECK (char_length("programs"."name") between 1 and 60),
	CONSTRAINT "programs_status_valid" CHECK ("programs"."status" in ('draft', 'published', 'archived')),
	CONSTRAINT "programs_tone_valid" CHECK ("programs"."tone" in ('terracotta', 'sage', 'sand', 'white', 'caramel')),
	CONSTRAINT "programs_illustration_valid" CHECK ("programs"."illustration" in ('barbell', 'breath', 'plate')),
	CONSTRAINT "programs_series_valid" CHECK ("programs"."series" in ('strength', 'focus')),
	CONSTRAINT "programs_step_matches_series" CHECK (("programs"."series" = 'strength' and "programs"."step" is not null and "programs"."step" between 1 and 3) or ("programs"."series" = 'focus' and "programs"."step" is null)),
	CONSTRAINT "programs_tags_count" CHECK (coalesce(array_length("programs"."tags", 1), 0) <= 6),
	CONSTRAINT "programs_published_has_date" CHECK ("programs"."status" <> 'published' or "programs"."published_at" is not null),
	CONSTRAINT "programs_sort_order_non_negative" CHECK ("programs"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "programs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "program_volumes" ADD CONSTRAINT "program_volumes_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_volumes" ADD CONSTRAINT "program_volumes_file_uploaded_by_users_id_fk" FOREIGN KEY ("file_uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "program_volumes_program_number_unique" ON "program_volumes" USING btree ("program_id","volume_number");--> statement-breakpoint
CREATE INDEX "programs_status_order_idx" ON "programs" USING btree ("status","sort_order");