CREATE TABLE "client_checkin_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checkin_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_checkin_photos_path_length" CHECK (char_length("client_checkin_photos"."storage_path") between 1 and 512)
);
--> statement-breakpoint
ALTER TABLE "client_checkin_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"checkin_date" date NOT NULL,
	"weight_grams" integer NOT NULL,
	"waist_mm" integer,
	"hips_mm" integer,
	"chest_mm" integer,
	"arm_mm" integer,
	"thigh_mm" integer,
	"neck_mm" integer,
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_checkins_weight_range" CHECK ("client_checkins"."weight_grams" between 20000 and 400000),
	CONSTRAINT "client_checkins_measurements_non_negative" CHECK (
      ("client_checkins"."waist_mm" is null or "client_checkins"."waist_mm" >= 0) and
      ("client_checkins"."hips_mm"  is null or "client_checkins"."hips_mm"  >= 0) and
      ("client_checkins"."chest_mm" is null or "client_checkins"."chest_mm" >= 0) and
      ("client_checkins"."arm_mm"   is null or "client_checkins"."arm_mm"   >= 0) and
      ("client_checkins"."thigh_mm" is null or "client_checkins"."thigh_mm" >= 0) and
      ("client_checkins"."neck_mm"  is null or "client_checkins"."neck_mm"  >= 0)
    )
);
--> statement-breakpoint
ALTER TABLE "client_checkins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_health_profiles" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"date_of_birth" date NOT NULL,
	"biological_sex" text NOT NULL,
	"height_cm" integer NOT NULL,
	"activity_level" text DEFAULT 'moderate' NOT NULL,
	"goal" text DEFAULT 'maintain' NOT NULL,
	"target_weight_grams" integer,
	"weekly_rate_grams" integer,
	"dietary_notes" text,
	"medical_notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_health_profiles_sex_value" CHECK ("client_health_profiles"."biological_sex" in ('female', 'male')),
	CONSTRAINT "client_health_profiles_height_range" CHECK ("client_health_profiles"."height_cm" between 50 and 300),
	CONSTRAINT "client_health_profiles_activity_value" CHECK ("client_health_profiles"."activity_level" in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
	CONSTRAINT "client_health_profiles_goal_value" CHECK ("client_health_profiles"."goal" in ('lose_fat', 'maintain', 'gain_muscle')),
	CONSTRAINT "client_health_profiles_target_weight_positive" CHECK ("client_health_profiles"."target_weight_grams" is null or "client_health_profiles"."target_weight_grams" > 0),
	CONSTRAINT "client_health_profiles_weekly_rate_non_negative" CHECK ("client_health_profiles"."weekly_rate_grams" is null or "client_health_profiles"."weekly_rate_grams" >= 0)
);
--> statement-breakpoint
ALTER TABLE "client_health_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_nutrition_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"checkin_id" uuid,
	"method" text DEFAULT 'mifflin_st_jeor' NOT NULL,
	"effective_from" date NOT NULL,
	"bmr_kcal" integer NOT NULL,
	"tdee_kcal" integer NOT NULL,
	"target_kcal" integer NOT NULL,
	"protein_g" integer NOT NULL,
	"carbs_g" integer NOT NULL,
	"fat_g" integer NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_nutrition_targets_method_value" CHECK ("client_nutrition_targets"."method" in ('mifflin_st_jeor')),
	CONSTRAINT "client_nutrition_targets_kcal_non_negative" CHECK (
      "client_nutrition_targets"."bmr_kcal" >= 0 and "client_nutrition_targets"."tdee_kcal" >= 0 and "client_nutrition_targets"."target_kcal" >= 0 and
      "client_nutrition_targets"."protein_g" >= 0 and "client_nutrition_targets"."carbs_g" >= 0 and "client_nutrition_targets"."fat_g" >= 0
    )
);
--> statement-breakpoint
ALTER TABLE "client_nutrition_targets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_checkin_photos" ADD CONSTRAINT "client_checkin_photos_checkin_id_client_checkins_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."client_checkins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_checkins" ADD CONSTRAINT "client_checkins_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_checkins" ADD CONSTRAINT "client_checkins_created_by_user_id_profiles_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_health_profiles" ADD CONSTRAINT "client_health_profiles_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_health_profiles" ADD CONSTRAINT "client_health_profiles_created_by_user_id_profiles_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_nutrition_targets" ADD CONSTRAINT "client_nutrition_targets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_nutrition_targets" ADD CONSTRAINT "client_nutrition_targets_checkin_id_client_checkins_id_fk" FOREIGN KEY ("checkin_id") REFERENCES "public"."client_checkins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_nutrition_targets" ADD CONSTRAINT "client_nutrition_targets_created_by_user_id_profiles_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."profiles"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_checkin_photos_checkin_idx" ON "client_checkin_photos" USING btree ("checkin_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_checkins_client_date_unique" ON "client_checkins" USING btree ("client_id","checkin_date");--> statement-breakpoint
CREATE INDEX "client_checkins_client_date_idx" ON "client_checkins" USING btree ("client_id","checkin_date");--> statement-breakpoint
CREATE INDEX "client_nutrition_targets_client_effective_idx" ON "client_nutrition_targets" USING btree ("client_id","effective_from");