import { z } from 'zod';

/**
 * Shared coaching contracts + the calorie/macro calculation.
 *
 * Units follow the repo convention of storing everything as integers in a base
 * unit (like prices in cents): weight in grams, lengths in centimetres /
 * millimetres. The admin UI works in kilograms / centimetres and converts on
 * submit.
 */

export const biologicalSexValues = ['female', 'male'] as const;
export type BiologicalSex = (typeof biologicalSexValues)[number];

export const activityLevelValues = [
  'sedentary',
  'light',
  'moderate',
  'active',
  'very_active',
] as const;
export type ActivityLevel = (typeof activityLevelValues)[number];

export const coachingGoalValues = ['lose_fat', 'maintain', 'gain_muscle'] as const;
export type CoachingGoal = (typeof coachingGoalValues)[number];

export const nutritionMethodValues = ['mifflin_st_jeor'] as const;
export type NutritionMethod = (typeof nutritionMethodValues)[number];

/** Total Daily Energy Expenditure multipliers applied to BMR. */
export const activityMultipliers: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const activityLevelLabels: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary — little or no exercise',
  light: 'Light — exercise 1–3 days/week',
  moderate: 'Moderate — exercise 3–5 days/week',
  active: 'Active — exercise 6–7 days/week',
  very_active: 'Very active — hard exercise or physical job',
};

export const coachingGoalLabels: Record<CoachingGoal, string> = {
  lose_fat: 'Lose fat',
  maintain: 'Maintain',
  gain_muscle: 'Gain muscle',
};

export const biologicalSexLabels: Record<BiologicalSex, string> = {
  female: 'Female',
  male: 'Male',
};

/** Roughly 7,700 kcal per kilogram of body fat. */
export const KCAL_PER_KG_BODYWEIGHT = 7700;

/** Safety floors so a target is never dangerously low. */
export const MIN_TARGET_KCAL: Record<BiologicalSex, number> = {
  female: 1200,
  male: 1500,
};

/** Protein target in grams per kg of body weight. */
const PROTEIN_G_PER_KG = 1.8;
/** Share of total calories from fat. */
const FAT_KCAL_FRACTION = 0.25;

export interface NutritionInput {
  biologicalSex: BiologicalSex;
  /** ISO date (yyyy-mm-dd). */
  dateOfBirth: string;
  heightCm: number;
  weightGrams: number;
  activityLevel: ActivityLevel;
  goal: CoachingGoal;
  /** Desired weekly change in grams (magnitude). Optional. */
  weeklyRateGrams?: number | null;
  /** Reference date the age is computed against. ISO date string. */
  asOf: string;
}

export interface NutritionResult {
  method: NutritionMethod;
  ageYears: number;
  bmrKcal: number;
  tdeeKcal: number;
  targetKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Whole years between two ISO dates (yyyy-mm-dd). */
export function computeAgeYears(dateOfBirth: string, asOf: string): number {
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  const reference = new Date(`${asOf}T00:00:00Z`);
  let age = reference.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = reference.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && reference.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/**
 * Mifflin-St Jeor BMR + activity-adjusted TDEE + goal-adjusted target and a
 * protein-first macro split. Pure and deterministic given its inputs.
 */
export function calculateNutrition(input: NutritionInput): NutritionResult {
  const kg = input.weightGrams / 1000;
  const cm = input.heightCm;
  const age = computeAgeYears(input.dateOfBirth, input.asOf);

  const base = 10 * kg + 6.25 * cm - 5 * age;
  const bmr = base + (input.biologicalSex === 'male' ? 5 : -161);

  const tdee = bmr * activityMultipliers[input.activityLevel];

  const weeklyRate = Math.abs(input.weeklyRateGrams ?? 0) / 1000; // kg/week
  const dailyDelta = (weeklyRate * KCAL_PER_KG_BODYWEIGHT) / 7;

  let target = tdee;
  if (input.goal === 'lose_fat') target = tdee - dailyDelta;
  else if (input.goal === 'gain_muscle') target = tdee + dailyDelta;

  target = Math.max(target, MIN_TARGET_KCAL[input.biologicalSex]);

  // Macros: protein by bodyweight, fat as a share of calories, carbs fill the rest.
  const proteinG = Math.round(PROTEIN_G_PER_KG * kg);
  const fatG = Math.round((target * FAT_KCAL_FRACTION) / 9);
  const remainingKcal = target - proteinG * 4 - fatG * 9;
  const carbsG = Math.max(0, Math.round(remainingKcal / 4));

  return {
    method: 'mifflin_st_jeor',
    ageYears: age,
    bmrKcal: Math.round(bmr),
    tdeeKcal: Math.round(tdee),
    targetKcal: Math.round(target),
    proteinG,
    carbsG,
    fatG,
  };
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Use a valid date.');

export const healthProfileUpsertSchema = z.object({
  dateOfBirth: isoDate,
  biologicalSex: z.enum(biologicalSexValues),
  heightCm: z.number().int('Enter height in whole centimetres.').min(50).max(300),
  activityLevel: z.enum(activityLevelValues).default('moderate'),
  goal: z.enum(coachingGoalValues).default('maintain'),
  targetWeightGrams: z.number().int().min(20_000).max(400_000).nullable().optional().default(null),
  weeklyRateGrams: z.number().int().min(0).max(2_000).nullable().optional().default(null),
  dietaryNotes: z.string().trim().max(2_000).optional().default(''),
  medicalNotes: z.string().trim().max(2_000).optional().default(''),
});

const measurementMm = z.number().int().min(0).max(5_000).nullable().optional().default(null);

export const checkinCreateSchema = z.object({
  checkinDate: isoDate,
  weightGrams: z.number().int('Enter a valid weight.').min(20_000).max(400_000),
  bodyFatPctTenths: z.number().int().min(0).max(1_000).nullable().optional().default(null),
  waistMm: measurementMm,
  hipsMm: measurementMm,
  chestMm: measurementMm,
  neckMm: measurementMm,
  leftArmMm: measurementMm,
  rightArmMm: measurementMm,
  leftThighMm: measurementMm,
  rightThighMm: measurementMm,
  leftCalfMm: measurementMm,
  rightCalfMm: measurementMm,
  notes: z.string().trim().max(2_000).optional().default(''),
});

export type HealthProfileUpsertRequest = z.infer<typeof healthProfileUpsertSchema>;
export type CheckinCreateRequest = z.infer<typeof checkinCreateSchema>;
