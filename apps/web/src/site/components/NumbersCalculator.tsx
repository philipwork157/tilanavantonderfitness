import { useEffect, useMemo, useState } from 'react';
import { motion, useMotionValueEvent, useSpring } from 'motion/react';
import Icon from './Icon';

const activities = [
  { label: 'Mostly sitting', m: 1.2 },
  { label: 'Light, 1–3 days', m: 1.375 },
  { label: 'Moderate, 3–5 days', m: 1.55 },
  { label: 'Active, 6–7 days', m: 1.725 },
];
const goals = [
  { key: 'lose', label: 'Lose fat', delta: -400 },
  { key: 'maintain', label: 'Maintain', delta: 0 },
  { key: 'gain', label: 'Build muscle', delta: 250 },
] as const;

// Deterministic formatting (same on server and browser), with a thin space for thousands.
const fmt = (v: number) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function Num({ value }: { value: number }) {
  const spring = useSpring(value, { stiffness: 90, damping: 20 });
  const [text, setText] = useState(() => fmt(value));
  useMotionValueEvent(spring, 'change', (v) => setText(fmt(v)));
  useEffect(() => { spring.set(value); }, [spring, value]);
  return <span>{text}</span>;
}

/** "Know your numbers, gently." Mifflin–St Jeor estimate with a macro split. */
export default function NumbersCalculator({ nourishHref }: { nourishHref: string }) {
  const [sex, setSex] = useState<'female' | 'male'>('female');
  const [age, setAge] = useState(32);
  const [height, setHeight] = useState(166);
  const [weight, setWeight] = useState(70);
  const [act, setAct] = useState(2);
  const [goal, setGoal] = useState<(typeof goals)[number]['key']>('maintain');

  const r = useMemo(() => {
    const bmr = 10 * weight + 6.25 * height - 5 * age + (sex === 'male' ? 5 : -161);
    const tdee = bmr * activities[act]!.m;
    const delta = goals.find((g) => g.key === goal)!.delta;
    const target = Math.max(tdee + delta, sex === 'male' ? 1500 : 1200);
    const protein = Math.round(1.8 * weight);
    const fat = Math.round((target * 0.25) / 9);
    const carbs = Math.max(0, Math.round((target - protein * 4 - fat * 9) / 4));
    return { bmr, tdee, target, protein, fat, carbs };
  }, [sex, age, height, weight, act, goal]);

  const total = r.protein * 4 + r.carbs * 4 + r.fat * 9;
  const seg = [
    { label: 'Protein', g: r.protein, kcal: r.protein * 4, color: 'var(--seg-protein)' },
    { label: 'Carbs', g: r.carbs, kcal: r.carbs * 4, color: 'var(--seg-carbs)' },
    { label: 'Fat', g: r.fat, kcal: r.fat * 9, color: 'var(--seg-fat)' },
  ];
  let offset = 0;

  return (
    <div className="calc card">
      <div className="calc-inputs">
        <div className="seg" role="radiogroup" aria-label="Sex (for the equation)">
          {(['female', 'male'] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={sex === s} className={sex === s ? 'on' : ''} onClick={() => setSex(s)}>
              {sex === s && <motion.span layoutId="calc-sex" className="seg-pill" />}<span>{s === 'female' ? 'Female' : 'Male'}</span>
            </button>
          ))}
        </div>
        {[
          { id: 'age', label: 'Age', value: age, set: setAge, min: 16, max: 80, unit: 'yrs' },
          { id: 'height', label: 'Height', value: height, set: setHeight, min: 140, max: 210, unit: 'cm' },
          { id: 'weight', label: 'Weight', value: weight, set: setWeight, min: 40, max: 160, unit: 'kg' },
        ].map((f) => (
          <label key={f.id} className="slider">
            <span className="slider-top"><span>{f.label}</span><b>{f.value} {f.unit}</b></span>
            <input type="range" min={f.min} max={f.max} value={f.value} onChange={(e) => f.set(Number(e.target.value))} style={{ '--fill': `${((f.value - f.min) / (f.max - f.min)) * 100}%` } as never} />
          </label>
        ))}
        <label className="slider">
          <span className="slider-top"><span>Activity</span><b>{activities[act]!.label}</b></span>
          <input type="range" min={0} max={3} value={act} onChange={(e) => setAct(Number(e.target.value))} style={{ '--fill': `${(act / 3) * 100}%` } as never} />
        </label>
        <div className="seg seg-goals" role="radiogroup" aria-label="Goal">
          {goals.map((g) => (
            <button key={g.key} type="button" role="radio" aria-checked={goal === g.key} className={goal === g.key ? 'on' : ''} onClick={() => setGoal(g.key)}>
              {goal === g.key && <motion.span layoutId="calc-goal" className="seg-pill" />}<span>{g.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="calc-result">
        <div className="ring">
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="50" className="ring-track" />
            {seg.map((s) => {
              const len = total ? s.kcal / total : 0;
              const el = (
                <motion.circle
                  key={s.label}
                  cx="60" cy="60" r="50"
                  className="ring-seg"
                  style={{ stroke: s.color, rotate: -90 + offset * 360, transformOrigin: '60px 60px' }}
                  initial={false}
                  animate={{ pathLength: Math.max(0, len - 0.012) }}
                  transition={{ type: 'spring', stiffness: 80, damping: 18 }}
                />
              );
              offset += len;
              return el;
            })}
          </svg>
          <div className="ring-center">
            <strong><Num value={r.target} /></strong>
            <span>kcal / day</span>
          </div>
        </div>
        <ul className="macros">
          {seg.map((s) => (
            <li key={s.label}><i style={{ background: s.color }} /> {s.label} <b><Num value={s.g} />g</b></li>
          ))}
        </ul>
        <p className="calc-meta">Maintenance ≈ <Num value={r.tdee} /> kcal · Resting ≈ <Num value={r.bmr} /> kcal</p>
        <p className="calc-note">An estimate using the Mifflin–St Jeor equation. It’s a starting point, not medical advice. Pregnant or breastfeeding? Your needs change, so chat to your healthcare provider.</p>
        <div className="calc-cta">
          <p>Want to understand what these numbers mean on your plate? <strong>Nourish</strong> explains it in plain language.</p>
          <a className="link-arrow" href={nourishHref}>Learn about Nourish <Icon name="arrow" /></a>
        </div>
      </div>
    </div>
  );
}
