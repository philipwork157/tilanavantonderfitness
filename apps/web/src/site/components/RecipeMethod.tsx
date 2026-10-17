import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Icon from './Icon';

type Ingredient = { qty?: number; unit?: string; item: string; note?: string };

const FRACTIONS: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
const COUNTABLE_UNITS = ['slice', 'clove', 'sprig'];

/** Weights and volumes round to sensible numbers; everything else to the nearest quarter (¼, ½, ¾). */
function formatQty(value: number, unit?: string): string {
  if (unit === 'g' || unit === 'ml') return String(value >= 50 ? Math.round(value / 5) * 5 : Math.round(value));
  const q = Math.max(0.25, Math.round(value * 4) / 4);
  const whole = Math.floor(q);
  const frac = FRACTIONS[q - whole] ?? '';
  return whole ? `${whole}${frac}` : frac;
}

function formatUnit(unit: string | undefined, value: number): string {
  if (!unit) return '';
  const base = unit.replace(/s$/, '');
  if (COUNTABLE_UNITS.includes(base)) return value > 1 ? `${base}s` : base;
  return unit;
}

/** banana → bananas, eggs → egg, tomato → tomatoes. Multi-word items are left alone. */
function formatItem(item: string, value: number | undefined, unit: string | undefined): string {
  if (unit || value === undefined || /\s/.test(item)) return item;
  if (value > 1) return item.endsWith('s') ? item : /[^aeiu]o$/.test(item) && item !== 'avocado' ? `${item}es` : `${item}s`;
  return item.endsWith('s') ? item.slice(0, -1) : item;
}

/** Servings scaler, ingredient checklist and step-by-step method. Ticks are kept for this visit only. */
export default function RecipeMethod({ servings, ingredients, steps }: { servings: number; ingredients: Ingredient[]; steps: string[] }) {
  const [n, setN] = useState(servings);
  const [have, setHave] = useState<number[]>([]);
  const [done, setDone] = useState<number[]>([]);
  const flip = (list: number[], i: number) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i]);
  const factor = n / servings;

  return (
    <div className="method">
      <section className="method-block" aria-labelledby="ingredients-title">
        <div className="method-head">
          <h2 id="ingredients-title">Ingredients</h2>
          <div className="stepper" role="group" aria-label="Servings">
            <button type="button" aria-label="Fewer servings" disabled={n <= 1} onClick={() => setN(n - 1)}>−</button>
            <output aria-live="polite"><b>{n}</b> {n === 1 ? 'serving' : 'servings'}</output>
            <button type="button" aria-label="More servings" disabled={n >= 12} onClick={() => setN(n + 1)}>+</button>
          </div>
        </div>
        <ul className="ingredients">
          {ingredients.map((ing, i) => {
            const value = ing.qty === undefined ? undefined : ing.qty * factor;
            const on = have.includes(i);
            return (
              <li key={i}>
                <button type="button" className={on ? 'ing on' : 'ing'} aria-pressed={on} onClick={() => setHave(flip(have, i))}>
                  <span className="tick" aria-hidden="true">{on && <Icon name="check" />}</span>
                  <span className="ing-text">
                    {value !== undefined && <b>{formatQty(value, ing.unit)}{ing.unit ? (ing.unit === 'g' || ing.unit === 'ml' ? ` ${ing.unit}` : ` ${formatUnit(ing.unit, value)}`) : ''}</b>}{' '}
                    {formatItem(ing.item, value, ing.unit)}
                    {ing.note && <small>{ing.note}</small>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {n !== servings && <p className="method-note">Quantities scaled from {servings} {servings === 1 ? 'serving' : 'servings'}. Cooking times stay about the same.</p>}
      </section>

      <section className="method-block" aria-labelledby="method-title">
        <div className="method-head">
          <h2 id="method-title">Method</h2>
          <p className="method-progress">{done.length} of {steps.length} done</p>
        </div>
        <ol className="steps">
          {steps.map((s, i) => {
            const on = done.includes(i);
            return (
              <li key={i}>
                <button type="button" className={on ? 'step on' : 'step'} aria-pressed={on} onClick={() => setDone(flip(done, i))}>
                  <span className="step-n" aria-hidden="true">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span key={on ? 'c' : 'n'} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.18 }}>
                        {on ? <Icon name="check" /> : i + 1}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                  <span className="step-text">{s}</span>
                </button>
              </li>
            );
          })}
        </ol>
        {done.length === steps.length && <p className="method-done">Done. Enjoy every bite.</p>}
      </section>
    </div>
  );
}
