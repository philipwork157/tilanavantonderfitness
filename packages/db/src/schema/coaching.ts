import { sql } from 'drizzle-orm';
import { check, date, foreignKey, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { clients, users } from './identity';

// Biological sex is required for the BMR calculation and is kept separate from
// the identity `gender` field on `clients`.
export const biologicalSexValues = ['female', 'male'] as const;
export type BiologicalSex = (typeof biologicalSexValues)[number];

export const activityLevelValues = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
export type ActivityLevel = (typeof activityLevelValues)[number];

export const coachingGoalValues = ['lose_fat', 'maintain', 'gain_muscle'] as const;
export type CoachingGoal = (typeof coachingGoalValues)[number];

export const nutritionMethodValues = ['mifflin_st_jeor'] as const;
export type NutritionMethod = (typeof nutritionMethodValues)[number];

/**
 * One row per client: the slowly-changing baseline used to calculate calories.
 * Health data — available only through authenticated admin server routes. RLS
 * remains deny-by-default for direct Supabase client access.
 */
export const clientHealthProfiles = pgTable(
  'client_health_profiles',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
    dateOfBirth: date('date_of_birth').notNull(),
    biologicalSex: text('biological_sex').$type<BiologicalSex>().notNull(),
    heightCm: integer('height_cm').notNull(),
    activityLevel: text('activity_level').$type<ActivityLevel>().notNull().default('moderate'),
    goal: text('goal').$type<CoachingGoal>().notNull().default('maintain'),
    targetWeightGrams: integer('target_weight_grams'),
    weeklyRateGrams: integer('weekly_rate_grams'),
    dietaryNotes: text('dietary_notes'),
    medicalNotes: text('medical_notes'),
    createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('client_health_profiles_client_unique').on(table.clientId),
    check('client_health_profiles_sex_value', sql`${table.biologicalSex} in ('female', 'male')`),
    check('client_health_profiles_height_range', sql`${table.heightCm} between 50 and 300`),
    check('client_health_profiles_activity_value', sql`${table.activityLevel} in ('sedentary', 'light', 'moderate', 'active', 'very_active')`),
    check('client_health_profiles_goal_value', sql`${table.goal} in ('lose_fat', 'maintain', 'gain_muscle')`),
    check('client_health_profiles_target_weight_positive', sql`${table.targetWeightGrams} is null or ${table.targetWeightGrams} > 0`),
    check('client_health_profiles_weekly_rate_non_negative', sql`${table.weeklyRateGrams} is null or ${table.weeklyRateGrams} >= 0`),
  ],
).enableRLS();

/**
 * One row per client check-in: weight and body measurements over time.
 * All lengths stored in millimetres, weight in grams (integers, like prices in cents).
 */
export const clientCheckins = pgTable(
  'client_checkins',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
    checkinDate: date('checkin_date').notNull(),
    weightGrams: integer('weight_grams').notNull(),
    waistMm: integer('waist_mm'),
    hipsMm: integer('hips_mm'),
    chestMm: integer('chest_mm'),
    neckMm: integer('neck_mm'),
    leftArmMm: integer('left_arm_mm'),
    rightArmMm: integer('right_arm_mm'),
    leftThighMm: integer('left_thigh_mm'),
    rightThighMm: integer('right_thigh_mm'),
    leftCalfMm: integer('left_calf_mm'),
    rightCalfMm: integer('right_calf_mm'),
    bodyFatPctTenths: integer('body_fat_pct_tenths'),
    notes: text('notes'),
    createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('client_checkins_client_date_unique').on(table.clientId, table.checkinDate),
    uniqueIndex('client_checkins_id_client_unique').on(table.id, table.clientId),
    check('client_checkins_weight_range', sql`${table.weightGrams} between 20000 and 400000`),
    check('client_checkins_measurements_non_negative', sql`
      (${table.waistMm} is null or ${table.waistMm} >= 0) and
      (${table.hipsMm}  is null or ${table.hipsMm}  >= 0) and
      (${table.chestMm} is null or ${table.chestMm} >= 0) and
      (${table.neckMm}  is null or ${table.neckMm}  >= 0) and
      (${table.leftArmMm}    is null or ${table.leftArmMm}    >= 0) and
      (${table.rightArmMm}   is null or ${table.rightArmMm}   >= 0) and
      (${table.leftThighMm}  is null or ${table.leftThighMm}  >= 0) and
      (${table.rightThighMm} is null or ${table.rightThighMm} >= 0) and
      (${table.leftCalfMm}   is null or ${table.leftCalfMm}   >= 0) and
      (${table.rightCalfMm}  is null or ${table.rightCalfMm}  >= 0)
    `),
    check('client_checkins_body_fat_range', sql`${table.bodyFatPctTenths} is null or ${table.bodyFatPctTenths} between 0 and 1000`),
  ],
).enableRLS();

/** Progress photos for a check-in. The image itself lives in private Supabase Storage. */
export const clientCheckinPhotos = pgTable(
  'client_checkin_photos',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    checkinId: integer('checkin_id').notNull().references(() => clientCheckins.id, { onDelete: 'cascade' }),
    storagePath: text('storage_path').notNull(),
    caption: text('caption'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('client_checkin_photos_checkin_idx').on(table.checkinId),
    check('client_checkin_photos_path_length', sql`char_length(${table.storagePath}) between 1 and 512`),
  ],
).enableRLS();

/** Calorie & macro target history — one row each time targets are (re)calculated. */
export const clientNutritionTargets = pgTable(
  'client_nutrition_targets',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    clientId: integer('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
    checkinId: integer('checkin_id'),
    method: text('method').$type<NutritionMethod>().notNull().default('mifflin_st_jeor'),
    effectiveFrom: date('effective_from').notNull(),
    bmrKcal: integer('bmr_kcal').notNull(),
    tdeeKcal: integer('tdee_kcal').notNull(),
    targetKcal: integer('target_kcal').notNull(),
    proteinG: integer('protein_g').notNull(),
    carbsG: integer('carbs_g').notNull(),
    fatG: integer('fat_g').notNull(),
    createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('client_nutrition_targets_client_effective_idx').on(table.clientId, table.effectiveFrom),
    foreignKey({
      name: 'client_nutrition_targets_checkin_client_fk',
      columns: [table.checkinId, table.clientId],
      foreignColumns: [clientCheckins.id, clientCheckins.clientId],
    }).onDelete('cascade'),
    check('client_nutrition_targets_method_value', sql`${table.method} in ('mifflin_st_jeor')`),
    check('client_nutrition_targets_kcal_non_negative', sql`
      ${table.bmrKcal} >= 0 and ${table.tdeeKcal} >= 0 and ${table.targetKcal} >= 0 and
      ${table.proteinG} >= 0 and ${table.carbsG} >= 0 and ${table.fatG} >= 0
    `),
  ],
).enableRLS();
