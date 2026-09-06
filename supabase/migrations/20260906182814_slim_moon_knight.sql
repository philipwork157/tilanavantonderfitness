-- Preserve every existing UUID while translating application-owned keys to
-- auto-incrementing integers. Supabase Auth remains UUID-based through
-- users.supabase_id.
ALTER TABLE "profiles" RENAME TO "users";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "user_id" TO "supabase_id";--> statement-breakpoint

CREATE TEMP TABLE "_app_integer_id_map" (
  "entity" text NOT NULL,
  "old_id" uuid NOT NULL,
  "new_id" integer NOT NULL,
  PRIMARY KEY ("entity", "old_id"),
  UNIQUE ("entity", "new_id")
) ON COMMIT DROP;--> statement-breakpoint

INSERT INTO "_app_integer_id_map" ("entity", "old_id", "new_id")
SELECT 'program_access', "id", row_number() OVER (ORDER BY "id")::integer FROM "program_access"
UNION ALL SELECT 'program_files', "id", row_number() OVER (ORDER BY "id")::integer FROM "program_files"
UNION ALL SELECT 'program_volumes', "id", row_number() OVER (ORDER BY "id")::integer FROM "program_volumes"
UNION ALL SELECT 'programs', "id", row_number() OVER (ORDER BY "id")::integer FROM "programs"
UNION ALL SELECT 'client_checkin_photos', "id", row_number() OVER (ORDER BY "id")::integer FROM "client_checkin_photos"
UNION ALL SELECT 'client_checkins', "id", row_number() OVER (ORDER BY "id")::integer FROM "client_checkins"
UNION ALL SELECT 'client_nutrition_targets', "id", row_number() OVER (ORDER BY "id")::integer FROM "client_nutrition_targets"
UNION ALL SELECT 'contact_submissions', "id", row_number() OVER (ORDER BY "id")::integer FROM "contact_submissions"
UNION ALL SELECT 'clients', "id", row_number() OVER (ORDER BY "id")::integer FROM "clients"
UNION ALL SELECT 'invoice_items', "id", row_number() OVER (ORDER BY "id")::integer FROM "invoice_items"
UNION ALL SELECT 'invoices', "id", row_number() OVER (ORDER BY "id")::integer FROM "invoices"
UNION ALL SELECT 'newsletter_campaign_deliveries', "id", row_number() OVER (ORDER BY "id")::integer FROM "newsletter_campaign_deliveries"
UNION ALL SELECT 'newsletter_campaign_test_deliveries', "id", row_number() OVER (ORDER BY "id")::integer FROM "newsletter_campaign_test_deliveries"
UNION ALL SELECT 'newsletter_campaigns', "id", row_number() OVER (ORDER BY "id")::integer FROM "newsletter_campaigns"
UNION ALL SELECT 'newsletter_subscribers', "id", row_number() OVER (ORDER BY "id")::integer FROM "newsletter_subscribers"
UNION ALL SELECT 'newsletter_tokens', "id", row_number() OVER (ORDER BY "id")::integer FROM "newsletter_tokens"
UNION ALL SELECT 'order_items', "id", row_number() OVER (ORDER BY "id")::integer FROM "order_items"
UNION ALL SELECT 'orders', "id", row_number() OVER (ORDER BY "id")::integer FROM "orders"
UNION ALL SELECT 'payments', "id", row_number() OVER (ORDER BY "id")::integer FROM "payments";--> statement-breakpoint

CREATE FUNCTION pg_temp.app_integer_id(entity_name text, uuid_value uuid)
RETURNS integer
LANGUAGE sql
STABLE
STRICT
AS $$
  SELECT "new_id"
  FROM "_app_integer_id_map"
  WHERE "entity" = entity_name AND "old_id" = uuid_value
$$;--> statement-breakpoint

-- Foreign keys must be removed while both sides are translated. This includes
-- the users.supabase_id -> auth.users.id constraint, which is restored below.
DO $$
DECLARE constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT ns.nspname AS schema_name, cls.relname AS table_name, con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE con.contype = 'f'
      AND ns.nspname = 'public'
      AND cls.relname = ANY (ARRAY[
        'program_access', 'program_files', 'program_volumes', 'client_checkin_photos',
        'client_checkins', 'client_health_profiles', 'client_nutrition_targets',
        'clients', 'user_roles', 'users', 'invoice_items', 'invoices',
        'newsletter_campaign_deliveries', 'newsletter_campaign_test_deliveries',
        'newsletter_campaigns', 'newsletter_tokens', 'order_items', 'orders', 'payments'
      ])
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      constraint_row.schema_name,
      constraint_row.table_name,
      constraint_row.constraint_name
    );
  END LOOP;
END
$$;--> statement-breakpoint

-- users gets a new internal key; its old UUID key becomes supabase_id.
ALTER TABLE "users" ADD COLUMN "id" integer GENERATED ALWAYS AS IDENTITY;--> statement-breakpoint
INSERT INTO "_app_integer_id_map" ("entity", "old_id", "new_id")
SELECT 'users', "supabase_id", "id" FROM "users";--> statement-breakpoint

-- Remove the two primary keys whose old relationship columns are no longer the
-- record identifiers.
DO $$
DECLARE constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT ns.nspname AS schema_name, cls.relname AS table_name, con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE con.contype = 'p'
      AND ns.nspname = 'public'
      AND cls.relname = ANY (ARRAY['users', 'user_roles', 'client_health_profiles'])
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      constraint_row.schema_name,
      constraint_row.table_name,
      constraint_row.constraint_name
    );
  END LOOP;
END
$$;--> statement-breakpoint

ALTER TABLE "user_roles" ADD COLUMN "id" integer GENERATED ALWAYS AS IDENTITY;--> statement-breakpoint
ALTER TABLE "client_health_profiles" ADD COLUMN "id" integer GENERATED ALWAYS AS IDENTITY;--> statement-breakpoint

-- Translate UUID primary keys in place. Existing primary-key indexes and
-- non-ID data remain attached to their original rows.
ALTER TABLE "program_access" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" TYPE integer USING pg_temp.app_integer_id('program_access', "id");
ALTER TABLE "program_files" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" TYPE integer USING pg_temp.app_integer_id('program_files', "id");
ALTER TABLE "program_volumes" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" TYPE integer USING pg_temp.app_integer_id('program_volumes', "id");
ALTER TABLE "programs" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" TYPE integer USING pg_temp.app_integer_id('programs', "id");
ALTER TABLE "client_checkin_photos" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" TYPE integer USING pg_temp.app_integer_id('client_checkin_photos', "id");
ALTER TABLE "client_checkins" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" TYPE integer USING pg_temp.app_integer_id('client_checkins', "id");
ALTER TABLE "client_nutrition_targets" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" TYPE integer USING pg_temp.app_integer_id('client_nutrition_targets', "id");
ALTER TABLE "contact_submissions" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" TYPE integer USING pg_temp.app_integer_id('contact_submissions', "id");
ALTER TABLE "clients" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" TYPE integer USING pg_temp.app_integer_id('clients', "id");
ALTER TABLE "invoice_items" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" TYPE integer USING pg_temp.app_integer_id('invoice_items', "id");
ALTER TABLE "invoices" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" TYPE integer USING pg_temp.app_integer_id('invoices', "id");
ALTER TABLE "newsletter_campaign_deliveries" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" TYPE integer USING pg_temp.app_integer_id('newsletter_campaign_deliveries', "id");
ALTER TABLE "newsletter_campaign_test_deliveries" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" TYPE integer USING pg_temp.app_integer_id('newsletter_campaign_test_deliveries', "id");
ALTER TABLE "newsletter_campaigns" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" TYPE integer USING pg_temp.app_integer_id('newsletter_campaigns', "id");
ALTER TABLE "newsletter_subscribers" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" TYPE integer USING pg_temp.app_integer_id('newsletter_subscribers', "id");
ALTER TABLE "newsletter_tokens" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" TYPE integer USING pg_temp.app_integer_id('newsletter_tokens', "id");
ALTER TABLE "order_items" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" TYPE integer USING pg_temp.app_integer_id('order_items', "id");
ALTER TABLE "orders" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" TYPE integer USING pg_temp.app_integer_id('orders', "id");
ALTER TABLE "payments" ALTER COLUMN "id" DROP DEFAULT, ALTER COLUMN "id" TYPE integer USING pg_temp.app_integer_id('payments', "id");--> statement-breakpoint

-- Translate every application relationship through the preserved UUID maps.
ALTER TABLE "program_access"
  ALTER COLUMN "client_id" TYPE integer USING pg_temp.app_integer_id('clients', "client_id"),
  ALTER COLUMN "program_volume_id" TYPE integer USING pg_temp.app_integer_id('program_volumes', "program_volume_id"),
  ALTER COLUMN "order_item_id" TYPE integer USING pg_temp.app_integer_id('order_items', "order_item_id"),
  ALTER COLUMN "granted_by_user_id" TYPE integer USING pg_temp.app_integer_id('users', "granted_by_user_id");
ALTER TABLE "program_files" ALTER COLUMN "program_volume_id" TYPE integer USING pg_temp.app_integer_id('program_volumes', "program_volume_id");
ALTER TABLE "program_volumes" ALTER COLUMN "program_id" TYPE integer USING pg_temp.app_integer_id('programs', "program_id");
ALTER TABLE "client_checkin_photos" ALTER COLUMN "checkin_id" TYPE integer USING pg_temp.app_integer_id('client_checkins', "checkin_id");
ALTER TABLE "client_checkins"
  ALTER COLUMN "client_id" TYPE integer USING pg_temp.app_integer_id('clients', "client_id"),
  ALTER COLUMN "created_by_user_id" TYPE integer USING pg_temp.app_integer_id('users', "created_by_user_id");
ALTER TABLE "client_health_profiles"
  ALTER COLUMN "client_id" TYPE integer USING pg_temp.app_integer_id('clients', "client_id"),
  ALTER COLUMN "created_by_user_id" TYPE integer USING pg_temp.app_integer_id('users', "created_by_user_id");
ALTER TABLE "client_nutrition_targets"
  ALTER COLUMN "client_id" TYPE integer USING pg_temp.app_integer_id('clients', "client_id"),
  ALTER COLUMN "checkin_id" TYPE integer USING pg_temp.app_integer_id('client_checkins', "checkin_id"),
  ALTER COLUMN "created_by_user_id" TYPE integer USING pg_temp.app_integer_id('users', "created_by_user_id");
ALTER TABLE "clients"
  ALTER COLUMN "user_id" TYPE integer USING pg_temp.app_integer_id('users', "user_id"),
  ALTER COLUMN "created_by_user_id" TYPE integer USING pg_temp.app_integer_id('users', "created_by_user_id");
ALTER TABLE "user_roles" ALTER COLUMN "user_id" TYPE integer USING pg_temp.app_integer_id('users', "user_id");
ALTER TABLE "invoice_items"
  ALTER COLUMN "invoice_id" TYPE integer USING pg_temp.app_integer_id('invoices', "invoice_id"),
  ALTER COLUMN "program_volume_id" TYPE integer USING pg_temp.app_integer_id('program_volumes', "program_volume_id");
ALTER TABLE "invoices"
  ALTER COLUMN "client_id" TYPE integer USING pg_temp.app_integer_id('clients', "client_id"),
  ALTER COLUMN "order_id" TYPE integer USING pg_temp.app_integer_id('orders', "order_id"),
  ALTER COLUMN "created_by_user_id" TYPE integer USING pg_temp.app_integer_id('users', "created_by_user_id");
ALTER TABLE "newsletter_campaign_deliveries"
  ALTER COLUMN "campaign_id" TYPE integer USING pg_temp.app_integer_id('newsletter_campaigns', "campaign_id"),
  ALTER COLUMN "subscriber_id" TYPE integer USING pg_temp.app_integer_id('newsletter_subscribers', "subscriber_id");
ALTER TABLE "newsletter_campaign_test_deliveries" ALTER COLUMN "campaign_id" TYPE integer USING pg_temp.app_integer_id('newsletter_campaigns', "campaign_id");
ALTER TABLE "newsletter_campaigns" ALTER COLUMN "created_by_user_id" TYPE integer USING pg_temp.app_integer_id('users', "created_by_user_id");
ALTER TABLE "newsletter_tokens" ALTER COLUMN "subscriber_id" TYPE integer USING pg_temp.app_integer_id('newsletter_subscribers', "subscriber_id");
ALTER TABLE "order_items"
  ALTER COLUMN "order_id" TYPE integer USING pg_temp.app_integer_id('orders', "order_id"),
  ALTER COLUMN "program_volume_id" TYPE integer USING pg_temp.app_integer_id('program_volumes', "program_volume_id");
ALTER TABLE "orders"
  ALTER COLUMN "client_id" TYPE integer USING pg_temp.app_integer_id('clients', "client_id"),
  ALTER COLUMN "created_by_user_id" TYPE integer USING pg_temp.app_integer_id('users', "created_by_user_id");
ALTER TABLE "payments" ALTER COLUMN "order_id" TYPE integer USING pg_temp.app_integer_id('orders', "order_id");--> statement-breakpoint

-- Make all converted IDs auto-incrementing identities.
ALTER TABLE "program_access" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "program_files" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "program_volumes" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "programs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "client_checkin_photos" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "client_checkins" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "client_nutrition_targets" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "contact_submissions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "clients" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "invoice_items" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "invoices" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "newsletter_campaign_deliveries" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "newsletter_campaign_test_deliveries" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "newsletter_campaigns" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "newsletter_subscribers" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "newsletter_tokens" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "order_items" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "orders" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;
ALTER TABLE "payments" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY;--> statement-breakpoint

-- Advance each identity beyond the IDs assigned to existing rows.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users', 'user_roles', 'clients', 'programs', 'program_volumes',
    'program_files', 'orders', 'order_items', 'payments', 'program_access',
    'invoices', 'invoice_items', 'contact_submissions', 'client_health_profiles',
    'client_checkins', 'client_checkin_photos', 'client_nutrition_targets',
    'newsletter_subscribers', 'newsletter_tokens', 'newsletter_campaigns',
    'newsletter_campaign_deliveries', 'newsletter_campaign_test_deliveries'
  ]
  LOOP
    EXECUTE format(
      'SELECT setval(pg_get_serial_sequence(%L, %L), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL) FROM public.%I',
      'public.' || table_name,
      'id',
      table_name
    );
  END LOOP;
END
$$;--> statement-breakpoint

ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");
ALTER TABLE "client_health_profiles" ADD CONSTRAINT "client_health_profiles_pkey" PRIMARY KEY ("id");--> statement-breakpoint

DROP INDEX IF EXISTS "profiles_email_unique";
CREATE UNIQUE INDEX "users_supabase_id_unique" ON "users" USING btree ("supabase_id");
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree (lower("email"));
CREATE UNIQUE INDEX "user_roles_user_role_unique" ON "user_roles" USING btree ("user_id", "role");
CREATE UNIQUE INDEX "client_health_profiles_client_unique" ON "client_health_profiles" USING btree ("client_id");--> statement-breakpoint

ALTER TABLE "users" DROP CONSTRAINT "profiles_first_name_length";
ALTER TABLE "users" DROP CONSTRAINT "profiles_last_name_length";
ALTER TABLE "users" DROP CONSTRAINT "profiles_email_length";
ALTER TABLE "users" DROP CONSTRAINT "profiles_gender_value";
ALTER TABLE "users" ADD CONSTRAINT "users_first_name_length" CHECK (char_length("first_name") between 1 and 100);
ALTER TABLE "users" ADD CONSTRAINT "users_last_name_length" CHECK (char_length("last_name") between 1 and 100);
ALTER TABLE "users" ADD CONSTRAINT "users_email_length" CHECK (char_length("email") between 3 and 254);
ALTER TABLE "users" ADD CONSTRAINT "users_gender_value" CHECK ("gender" is null or "gender" in ('female', 'male', 'non-binary', 'other', 'prefer-not-to-say'));--> statement-breakpoint

ALTER TABLE "users" ADD CONSTRAINT "users_supabase_id_auth_users_id_fk" FOREIGN KEY ("supabase_id") REFERENCES "auth"."users"("id") ON DELETE cascade;
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
ALTER TABLE "clients" ADD CONSTRAINT "clients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null;
ALTER TABLE "clients" ADD CONSTRAINT "clients_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null;
ALTER TABLE "program_volumes" ADD CONSTRAINT "program_volumes_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade;
ALTER TABLE "program_files" ADD CONSTRAINT "program_files_program_volume_id_program_volumes_id_fk" FOREIGN KEY ("program_volume_id") REFERENCES "public"."program_volumes"("id") ON DELETE cascade;
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict;
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_program_volume_id_program_volumes_id_fk" FOREIGN KEY ("program_volume_id") REFERENCES "public"."program_volumes"("id") ON DELETE set null;
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict;
ALTER TABLE "program_access" ADD CONSTRAINT "program_access_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade;
ALTER TABLE "program_access" ADD CONSTRAINT "program_access_program_volume_id_program_volumes_id_fk" FOREIGN KEY ("program_volume_id") REFERENCES "public"."program_volumes"("id") ON DELETE restrict;
ALTER TABLE "program_access" ADD CONSTRAINT "program_access_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE set null;
ALTER TABLE "program_access" ADD CONSTRAINT "program_access_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade;
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_program_volume_id_program_volumes_id_fk" FOREIGN KEY ("program_volume_id") REFERENCES "public"."program_volumes"("id") ON DELETE set null;
ALTER TABLE "client_health_profiles" ADD CONSTRAINT "client_health_profiles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade;
ALTER TABLE "client_health_profiles" ADD CONSTRAINT "client_health_profiles_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null;
ALTER TABLE "client_checkins" ADD CONSTRAINT "client_checkins_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade;
ALTER TABLE "client_checkins" ADD CONSTRAINT "client_checkins_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null;
ALTER TABLE "client_checkin_photos" ADD CONSTRAINT "client_checkin_photos_checkin_id_client_checkins_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."client_checkins"("id") ON DELETE cascade;
ALTER TABLE "client_nutrition_targets" ADD CONSTRAINT "client_nutrition_targets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade;
ALTER TABLE "client_nutrition_targets" ADD CONSTRAINT "client_nutrition_targets_checkin_id_client_checkins_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."client_checkins"("id") ON DELETE set null;
ALTER TABLE "client_nutrition_targets" ADD CONSTRAINT "client_nutrition_targets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null;
ALTER TABLE "newsletter_tokens" ADD CONSTRAINT "newsletter_tokens_subscriber_id_newsletter_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."newsletter_subscribers"("id") ON DELETE cascade;
ALTER TABLE "newsletter_campaigns" ADD CONSTRAINT "newsletter_campaigns_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null;
ALTER TABLE "newsletter_campaign_deliveries" ADD CONSTRAINT "newsletter_campaign_deliveries_campaign_id_newsletter_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."newsletter_campaigns"("id") ON DELETE cascade;
ALTER TABLE "newsletter_campaign_deliveries" ADD CONSTRAINT "newsletter_campaign_deliveries_subscriber_id_newsletter_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."newsletter_subscribers"("id") ON DELETE restrict;
ALTER TABLE "newsletter_campaign_test_deliveries" ADD CONSTRAINT "newsletter_campaign_test_deliveries_campaign_id_newsletter_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."newsletter_campaigns"("id") ON DELETE cascade;
