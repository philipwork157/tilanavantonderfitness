CREATE TABLE "program_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"program_volume_id" uuid NOT NULL,
	"order_item_id" uuid,
	"source" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"granted_by_user_id" uuid,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_access_source_value" CHECK ("program_access"."source" in ('purchase', 'manual', 'promotion')),
	CONSTRAINT "program_access_status_value" CHECK ("program_access"."status" in ('active', 'revoked', 'expired')),
	CONSTRAINT "program_access_dates_valid" CHECK ("program_access"."expires_at" is null or "program_access"."expires_at" > "program_access"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "program_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "program_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_volume_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"r2_bucket" text NOT NULL,
	"r2_object_key" text NOT NULL,
	"content_type" text DEFAULT 'application/pdf' NOT NULL,
	"size_bytes" integer,
	"version" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_files_display_name_length" CHECK (char_length("program_files"."display_name") between 1 and 200),
	CONSTRAINT "program_files_size_non_negative" CHECK ("program_files"."size_bytes" is null or "program_files"."size_bytes" >= 0),
	CONSTRAINT "program_files_version_positive" CHECK ("program_files"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "program_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "program_volumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"volume_number" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"current_price_cents" integer NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "program_volumes_volume_number_positive" CHECK ("program_volumes"."volume_number" > 0),
	CONSTRAINT "program_volumes_name_length" CHECK (char_length("program_volumes"."name") between 1 and 160),
	CONSTRAINT "program_volumes_price_non_negative" CHECK ("program_volumes"."current_price_cents" >= 0),
	CONSTRAINT "program_volumes_currency_format" CHECK ("program_volumes"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "program_volumes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programs_slug_format" CHECK ("programs"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
	CONSTRAINT "programs_name_length" CHECK (char_length("programs"."name") between 1 and 120),
	CONSTRAINT "programs_status_value" CHECK ("programs"."status" in ('draft', 'published', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "programs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"gender" text,
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_first_name_length" CHECK (char_length("clients"."first_name") between 1 and 100),
	CONSTRAINT "clients_last_name_length" CHECK (char_length("clients"."last_name") between 1 and 100),
	CONSTRAINT "clients_email_length" CHECK (char_length("clients"."email") between 3 and 254),
	CONSTRAINT "clients_gender_value" CHECK ("clients"."gender" is null or "clients"."gender" in ('female', 'male', 'non-binary', 'other', 'prefer-not-to-say'))
);
--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"gender" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_first_name_length" CHECK (char_length("profiles"."first_name") between 1 and 100),
	CONSTRAINT "profiles_last_name_length" CHECK (char_length("profiles"."last_name") between 1 and 100),
	CONSTRAINT "profiles_email_length" CHECK (char_length("profiles"."email") between 3 and 254),
	CONSTRAINT "profiles_gender_value" CHECK ("profiles"."gender" is null or "profiles"."gender" in ('female', 'male', 'non-binary', 'other', 'prefer-not-to-say'))
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role"),
	CONSTRAINT "user_roles_role_value" CHECK ("user_roles"."role" in ('admin', 'customer', 'staff'))
);
--> statement-breakpoint
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"program_volume_id" uuid,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"line_total_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_items_description_length" CHECK (char_length("invoice_items"."description") between 1 and 240),
	CONSTRAINT "invoice_items_quantity_positive" CHECK ("invoice_items"."quantity" > 0),
	CONSTRAINT "invoice_items_unit_price_non_negative" CHECK ("invoice_items"."unit_price_cents" >= 0),
	CONSTRAINT "invoice_items_total_matches" CHECK ("invoice_items"."line_total_cents" = "invoice_items"."quantity" * "invoice_items"."unit_price_cents")
);
--> statement-breakpoint
ALTER TABLE "invoice_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text NOT NULL,
	"client_id" uuid NOT NULL,
	"order_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"seller_name" text NOT NULL,
	"seller_email" text,
	"seller_phone" text,
	"seller_address" text,
	"seller_tax_number" text,
	"client_name" text NOT NULL,
	"client_email" text NOT NULL,
	"client_phone" text,
	"client_address" text,
	"issue_date" date,
	"due_date" date,
	"notes" text,
	"pdf_r2_bucket" text,
	"pdf_r2_object_key" text,
	"created_by_user_id" uuid,
	"issued_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_status_value" CHECK ("invoices"."status" in ('draft', 'issued', 'paid', 'overdue', 'void')),
	CONSTRAINT "invoices_currency_format" CHECK ("invoices"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "invoices_pdf_r2_fields_together" CHECK (("invoices"."pdf_r2_bucket" is null and "invoices"."pdf_r2_object_key" is null) or ("invoices"."pdf_r2_bucket" is not null and "invoices"."pdf_r2_object_key" is not null)),
	CONSTRAINT "invoices_amounts_valid" CHECK ("invoices"."subtotal_cents" >= 0 and "invoices"."discount_cents" >= 0 and "invoices"."tax_cents" >= 0 and "invoices"."total_cents" >= 0),
	CONSTRAINT "invoices_total_matches_components" CHECK ("invoices"."total_cents" = "invoices"."subtotal_cents" - "invoices"."discount_cents" + "invoices"."tax_cents"),
	CONSTRAINT "invoices_dates_valid" CHECK ("invoices"."due_date" is null or "invoices"."issue_date" is null or "invoices"."due_date" >= "invoices"."issue_date")
);
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"program_volume_id" uuid,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"line_total_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_description_length" CHECK (char_length("order_items"."description") between 1 and 240),
	CONSTRAINT "order_items_quantity_positive" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_unit_price_non_negative" CHECK ("order_items"."unit_price_cents" >= 0),
	CONSTRAINT "order_items_total_matches" CHECK ("order_items"."line_total_cents" = "order_items"."quantity" * "order_items"."unit_price_cents")
);
--> statement-breakpoint
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" text NOT NULL,
	"client_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_by_user_id" uuid,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_status_value" CHECK ("orders"."status" in ('draft', 'pending', 'paid', 'cancelled', 'refunded')),
	CONSTRAINT "orders_currency_format" CHECK ("orders"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "orders_amounts_valid" CHECK ("orders"."subtotal_cents" >= 0 and "orders"."discount_cents" >= 0 and "orders"."tax_cents" >= 0 and "orders"."total_cents" >= 0),
	CONSTRAINT "orders_total_matches_components" CHECK ("orders"."total_cents" = "orders"."subtotal_cents" - "orders"."discount_cents" + "orders"."tax_cents")
);
--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider" text DEFAULT 'manual' NOT NULL,
	"provider_reference" text,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'ZAR' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_status_value" CHECK ("payments"."status" in ('pending', 'succeeded', 'failed', 'refunded')),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_cents" > 0),
	CONSTRAINT "payments_currency_format" CHECK ("payments"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "program_access" ADD CONSTRAINT "program_access_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_access" ADD CONSTRAINT "program_access_program_volume_id_program_volumes_id_fk" FOREIGN KEY ("program_volume_id") REFERENCES "public"."program_volumes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_access" ADD CONSTRAINT "program_access_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_access" ADD CONSTRAINT "program_access_granted_by_user_id_profiles_user_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_files" ADD CONSTRAINT "program_files_program_volume_id_program_volumes_id_fk" FOREIGN KEY ("program_volume_id") REFERENCES "public"."program_volumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_volumes" ADD CONSTRAINT "program_volumes_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_user_id_profiles_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_program_volume_id_program_volumes_id_fk" FOREIGN KEY ("program_volume_id") REFERENCES "public"."program_volumes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_user_id_profiles_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_program_volume_id_program_volumes_id_fk" FOREIGN KEY ("program_volume_id") REFERENCES "public"."program_volumes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_user_id_profiles_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "program_access_client_volume_active_unique" ON "program_access" USING btree ("client_id","program_volume_id") WHERE "program_access"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "program_access_order_item_unique" ON "program_access" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "program_access_client_status_idx" ON "program_access" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "program_access_volume_status_idx" ON "program_access" USING btree ("program_volume_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "program_files_r2_object_unique" ON "program_files" USING btree ("r2_bucket","r2_object_key");--> statement-breakpoint
CREATE INDEX "program_files_volume_active_idx" ON "program_files" USING btree ("program_volume_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "program_volumes_program_volume_unique" ON "program_volumes" USING btree ("program_id","volume_number");--> statement-breakpoint
CREATE INDEX "program_volumes_published_idx" ON "program_volumes" USING btree ("is_published");--> statement-breakpoint
CREATE UNIQUE INDEX "programs_slug_unique" ON "programs" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "programs_status_idx" ON "programs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_user_id_unique" ON "clients" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "clients_email_idx" ON "clients" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "clients_created_at_idx" ON "clients" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_email_unique" ON "profiles" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_invoice_number_unique" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "invoices_order_idx" ON "invoices" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_pdf_r2_object_unique" ON "invoices" USING btree ("pdf_r2_bucket","pdf_r2_object_key");--> statement-breakpoint
CREATE INDEX "invoices_client_created_at_idx" ON "invoices" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "invoices_status_due_date_idx" ON "invoices" USING btree ("status","due_date");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_program_volume_idx" ON "order_items" USING btree ("program_volume_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_unique" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "orders_client_created_at_idx" ON "orders" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_created_at_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_reference_unique" ON "payments" USING btree ("provider","provider_reference");--> statement-breakpoint
CREATE INDEX "payments_order_created_at_idx" ON "payments" USING btree ("order_id","created_at");