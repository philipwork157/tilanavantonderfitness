/*
 * "Know your numbers, gently." on the Kitchen page: a daily energy estimate
 * and a protein, carb and fat split. Kept here (not in the component) so the
 * maths is tested. Tilana can tune the numbers below.
 *
 * - Resting energy: the Mifflin-St Jeor equation.
 * - Maintenance: resting energy times the activity factor.
 * - Goal: a gentle change from maintenance, as a share of it with a cap, so it
 *   suits small and large bodies alike.
 * - Floors when losing fat: never below resting energy or 1 200 kcal (women) /
 *   1 500 kcal (men), and never above maintenance.
 * - Protein per kg, within the 1.4-2.0 g/kg range the page explains. Above a
 *   BMI of 25 it uses the weight at a BMI of 25, so a heavier body is not told
 *   to eat very large amounts.
 * - Fat: a quarter of the energy. Carbs: the rest.
 */

export type Sex = 'female' | 'male';

export const ACTIVITY_LEVELS = [
  { label: 'Mostly sitting', factor: 1.2 },
  { label: 'Light, 1–3 days', factor: 1.375 },
  { label: 'Moderate, 3–5 days', factor: 1.55 },
  { label: 'Active, 6–7 days', factor: 1.725 },
] as const;

export const GOALS = [
  // share: change from maintenance; cap: the most kcal it changes by; proteinPerKg: grams per kg.
  { key: 'lose', label: 'Lose fat', share: -0.15, cap: 500, proteinPerKg: 2.0 },
  { key: 'maintain', label: 'Maintain', share: 0, cap: 0, proteinPerKg: 1.6 },
  { key: 'gain', label: 'Build muscle', share: 0.1, cap: 300, proteinPerKg: 1.8 },
] as const;

export type GoalKey = (typeof GOALS)[number]['key'];

export const LIMITS = {
  age: { min: 18, max: 80 },
  height: { min: 140, max: 210 },
  weight: { min: 40, max: 160 },
} as const;

export interface NumbersInput {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  /** Index into ACTIVITY_LEVELS. */
  activity: number;
  goal: GoalKey;
}

export interface Numbers {
  resting: number;
  maintenance: number;
  target: number;
  protein: number;
  carbs: number;
  fat: number;
  /** True when a floor kept the target from going lower (losing fat with small numbers). */
  limited: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function estimateNumbers(input: NumbersInput): Numbers {
  const age = clamp(input.age, LIMITS.age.min, LIMITS.age.max);
  const height = clamp(input.heightCm, LIMITS.height.min, LIMITS.height.max);
  const weight = clamp(input.weightKg, LIMITS.weight.min, LIMITS.weight.max);
  const activity = ACTIVITY_LEVELS[clamp(Math.round(input.activity), 0, ACTIVITY_LEVELS.length - 1)]!;
  const goal = GOALS.find((g) => g.key === input.goal) ?? GOALS[1];

  const resting = 10 * weight + 6.25 * height - 5 * age + (input.sex === 'male' ? 5 : -161);
  const maintenance = resting * activity.factor;
  const change = Math.sign(goal.share) * Math.min(Math.abs(goal.share) * maintenance, goal.cap);
  let target = maintenance + change;
  let limited = false;
  if (goal.key === 'lose') {
    const floor = Math.min(maintenance, Math.max(resting, input.sex === 'male' ? 1500 : 1200));
    if (target < floor) {
      target = floor;
      limited = true;
    }
  }

  const heightM = height / 100;
  const referenceWeight = Math.min(weight, 25 * heightM * heightM);
  const protein = Math.round(goal.proteinPerKg * referenceWeight);
  const fat = Math.round((target * 0.25) / 9);
  const carbs = Math.max(0, Math.round((target - protein * 4 - fat * 9) / 4));

  return { resting, maintenance, target, protein, carbs, fat, limited };
}
