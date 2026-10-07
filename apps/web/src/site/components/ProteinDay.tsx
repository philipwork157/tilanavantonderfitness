import { useState } from 'react';
import { motion } from 'motion/react';

type Meal = { slug: string; title: string; protein: number };

/**
 * "Build a day": pick a body weight, tap a few meals, and see the total against
 * the 1.4–2.0 g/kg range from Tilana's protein post.
 */
export default function ProteinDay({ meals }: { meals: Meal[] }) {
  const [weight, setWeight] = useState(65);
  const [picked, setPicked] = useState<string[]>([]);
  const low = Math.round(weight * 1.4);
  const high = Math.round(weight * 2);
  const total = meals.filter((m) => picked.includes(m.slug)).reduce((sum, m) => sum + m.protein, 0);
  const max = Math.max(high * 1.25, total);
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;

  const toggle = (slug: string) => setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));

  let message = 'Tap a few meals to build a day.';
  if (total > 0 && total < low) message = `${low - total} g to go. A yoghurt or a glass of milk can help close the gap.`;
  else if (total >= low && total <= high) message = 'That’s in the range. Nicely done.';
  else if (total > high) message = 'Above the range. More isn’t automatically better, and there’s no prize for extra protein.';

  return (
    <div className="pday card">
      <label className="slider">
        <span className="slider-top"><span>Your weight</span><b>{weight} kg</b></span>
        <input type="range" min={40} max={140} value={weight} onChange={(e) => setWeight(Number(e.target.value))} style={{ '--fill': `${((weight - 40) / 100) * 100}%` } as never} />
      </label>

      <div className="pday-range">
        <p>A useful daily range</p>
        <strong>{low}–{high} g</strong>
        <span>about 20–40 g a meal, spread across the day</span>
      </div>

      <fieldset className="pday-meals">
        <legend>Build a day from the kitchen</legend>
        <div>
          {meals.map((m) => (
            <button key={m.slug} type="button" className={picked.includes(m.slug) ? 'pday-meal on' : 'pday-meal'} aria-pressed={picked.includes(m.slug)} onClick={() => toggle(m.slug)}>
              <span>{m.title}</span><b>{m.protein} g</b>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="pday-meter" aria-hidden="true">
        <span className="pday-zone" style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }} />
        <motion.span className="pday-fill" initial={false} animate={{ width: pct(total) }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
      </div>
      <p className="pday-total" aria-live="polite"><b>{total} g</b> {message}</p>
      <p className="pday-note">Based on roughly 1.4–2.0 g per kg a day for healthy people who exercise regularly. It’s a guide, not a rule. Your training, goals, age and health all matter.</p>
    </div>
  );
}
