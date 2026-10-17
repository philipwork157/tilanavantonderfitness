CREATE TABLE "volumes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "volumes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"number" smallint NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_by" bigint,
	"updated_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "volumes_number_unique" UNIQUE("number"),
	CONSTRAINT "volumes_number_range" CHECK ("volumes"."number" between 1 and 99),
	CONSTRAINT "volumes_name_length" CHECK (char_length("volumes"."name") between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "volumes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "volume_id" bigint;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "price_cents" integer;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "currency" text DEFAULT 'ZAR' NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "file_path" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "file_name" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "file_size_bytes" integer;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "file_sha256" text;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "file_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "file_uploaded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "file_uploaded_by" bigint;--> statement-breakpoint
ALTER TABLE "volumes" ADD CONSTRAINT "volumes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volumes" ADD CONSTRAINT "volumes_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_volume_id_volumes_id_fk" FOREIGN KEY ("volume_id") REFERENCES "public"."volumes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_file_uploaded_by_users_id_fk" FOREIGN KEY ("file_uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;