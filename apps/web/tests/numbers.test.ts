import { describe, expect, it } from 'vitest';
import { estimateNumbers, type NumbersInput } from '../src/site/numbers';

const base: NumbersInput = { sex: 'female', age: 32, heightCm: 166, weightKg: 70, activity: 2, goal: 'maintain' };

describe('Know your numbers', () => {
  it('uses Mifflin-St Jeor for resting energy and the activity factor for maintenance', () => {
    const woman = estimateNumbers(base);
    expect(woman.resting).toBeCloseTo(1416.5, 1); // 700 + 1037.5 - 160 - 161
    expect(woman.maintenance).toBeCloseTo(1416.5 * 1.55, 1);
    expect(woman.target).toBeCloseTo(woman.maintenance, 5);
    const man = estimateNumbers({ sex: 'male', age: 30, heightCm: 180, weightKg: 80, activity: 0, goal: 'maintain' });
    expect(man.resting).toBeCloseTo(1780, 5); // 800 + 1125 - 150 + 5
    expect(man.maintenance).toBeCloseTo(2136, 5);
  });

  it('changes gently for each goal, with a cap', () => {
    const maintenance = estimateNumbers(base).maintenance;
    expect(estimateNumbers({ ...base, goal: 'lose' }).target).toBeCloseTo(maintenance * 0.85, 5);
    expect(estimateNumbers({ ...base, goal: 'gain' }).target).toBeCloseTo(maintenance + 219.56, 1);
    const big = estimateNumbers({ sex: 'male', age: 25, heightCm: 195, weightKg: 110, activity: 3, goal: 'lose' });
    expect(big.maintenance - big.target).toBe(500);
  });

  it('never suggests eating more than maintenance to lose fat, or less than resting energy', () => {
    const small = estimateNumbers({ sex: 'female', age: 70, heightCm: 148, weightKg: 45, activity: 0, goal: 'lose' });
    expect(small.target).toBeLessThanOrEqual(small.maintenance);
    expect(small.limited).toBe(true);
    const typical = estimateNumbers({ ...base, goal: 'lose' });
    expect(typical.target).toBeGreaterThanOrEqual(Math.max(typical.resting, 1200));
    expect(typical.limited).toBe(false);
  });

  it('keeps protein in the 1.4-2.0 g/kg range, based on a healthy weight for heavier bodies', () => {
    const lean = { ...base, heightCm: 175 }; // BMI 22.9
    expect(estimateNumbers(lean).protein).toBe(112); // 1.6 x 70
    expect(estimateNumbers({ ...lean, goal: 'lose' }).protein).toBe(140); // 2.0 x 70
    expect(estimateNumbers({ ...lean, goal: 'gain' }).protein).toBe(126); // 1.8 x 70
    const heavier = estimateNumbers({ ...base, heightCm: 170, weightKg: 120 });
    expect(heavier.protein).toBe(116); // 1.6 x 72.25 kg (BMI 25 at 170 cm), not 192 g
  });

  it('splits the energy into protein, fat and carbs that add up', () => {
    for (const goal of ['lose', 'maintain', 'gain'] as const) {
      for (const sex of ['female', 'male'] as const) {
        const n = estimateNumbers({ ...base, sex, goal });
        const kcal = n.protein * 4 + n.carbs * 4 + n.fat * 9;
        expect(Math.abs(kcal - n.target)).toBeLessThan(15);
        expect(n.carbs).toBeGreaterThan(0);
      }
    }
  });

  it('stays sensible at every edge of the sliders', () => {
    for (const sex of ['female', 'male'] as const) {
      for (const age of [18, 80]) {
        for (const heightCm of [140, 210]) {
          for (const weightKg of [40, 160]) {
            for (const activity of [0, 3]) {
              for (const goal of ['lose', 'maintain', 'gain'] as const) {
                const n = estimateNumbers({ sex, age, heightCm, weightKg, activity, goal });
                expect(Number.isFinite(n.target)).toBe(true);
                expect(n.target).toBeGreaterThan(800);
                expect(n.carbs).toBeGreaterThanOrEqual(0);
                if (goal === 'lose') expect(n.target).toBeLessThanOrEqual(n.maintenance);
                if (goal === 'gain') expect(n.target).toBeGreaterThan(n.maintenance);
              }
            }
          }
        }
      }
    }
  });
});
