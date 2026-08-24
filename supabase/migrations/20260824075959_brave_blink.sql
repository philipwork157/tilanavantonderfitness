ALTER TABLE "client_checkins" DROP CONSTRAINT "client_checkins_measurements_non_negative";--> statement-breakpoint
ALTER TABLE "client_checkins" ADD COLUMN "left_arm_mm" integer;--> statement-breakpoint
ALTER TABLE "client_checkins" ADD COLUMN "right_arm_mm" integer;--> statement-breakpoint
ALTER TABLE "client_checkins" ADD COLUMN "left_thigh_mm" integer;--> statement-breakpoint
ALTER TABLE "client_checkins" ADD COLUMN "right_thigh_mm" integer;--> statement-breakpoint
ALTER TABLE "client_checkins" ADD COLUMN "left_calf_mm" integer;--> statement-breakpoint
ALTER TABLE "client_checkins" ADD COLUMN "right_calf_mm" integer;--> statement-breakpoint
ALTER TABLE "client_checkins" ADD COLUMN "body_fat_pct_tenths" integer;--> statement-breakpoint
ALTER TABLE "client_checkins" DROP COLUMN "arm_mm";--> statement-breakpoint
ALTER TABLE "client_checkins" DROP COLUMN "thigh_mm";--> statement-breakpoint
ALTER TABLE "client_checkins" ADD CONSTRAINT "client_checkins_body_fat_range" CHECK ("client_checkins"."body_fat_pct_tenths" is null or "client_checkins"."body_fat_pct_tenths" between 0 and 1000);--> statement-breakpoint
ALTER TABLE "client_checkins" ADD CONSTRAINT "client_checkins_measurements_non_negative" CHECK (
      ("client_checkins"."waist_mm" is null or "client_checkins"."waist_mm" >= 0) and
      ("client_checkins"."hips_mm"  is null or "client_checkins"."hips_mm"  >= 0) and
      ("client_checkins"."chest_mm" is null or "client_checkins"."chest_mm" >= 0) and
      ("client_checkins"."neck_mm"  is null or "client_checkins"."neck_mm"  >= 0) and
      ("client_checkins"."left_arm_mm"    is null or "client_checkins"."left_arm_mm"    >= 0) and
      ("client_checkins"."right_arm_mm"   is null or "client_checkins"."right_arm_mm"   >= 0) and
      ("client_checkins"."left_thigh_mm"  is null or "client_checkins"."left_thigh_mm"  >= 0) and
      ("client_checkins"."right_thigh_mm" is null or "client_checkins"."right_thigh_mm" >= 0) and
      ("client_checkins"."left_calf_mm"   is null or "client_checkins"."left_calf_mm"   >= 0) and
      ("client_checkins"."right_calf_mm"  is null or "client_checkins"."right_calf_mm"  >= 0)
    );