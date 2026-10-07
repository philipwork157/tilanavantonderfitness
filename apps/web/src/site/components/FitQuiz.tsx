import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { checkoutEnabled, programContactHref } from '../config';
import { programs } from '../data';
import { addAndOpen, productBySlug, rand } from './shop/basket';

type Answers = { stage?: string; goal?: string; place?: string };

const questions = [
  {
    key: 'stage' as const,
    q: 'Where are you right now?',
    options: [
      { v: 'new', label: 'New or coming back', hint: 'new to training, or returning after a break' },
      { v: 'basics', label: 'Comfortable with the basics', hint: 'I want a structured next step' },
      { v: 'experienced', label: 'Experienced', hint: 'I have an established training base' },
      { v: 'pregnancy', label: 'Pregnant or postpartum', hint: 'before, during or after birth' },
    ],
  },
  {
    key: 'goal' as const,
    q: 'What matters most to you?',
    options: [
      { v: 'strong', label: 'Getting stronger', hint: 'confidence with weights' },
      { v: 'food', label: 'Understanding food', hint: 'no rigid rules, no guilt' },
      { v: 'lose', label: 'Losing weight sustainably', hint: 'without crash diets' },
      { v: 'fit', label: 'Feeling fitter', hint: 'running, energy, everyday life' },
    ],
  },
  {
    key: 'place' as const,
    q: 'Where will you train?',
    options: [
      { v: 'home', label: 'At home', hint: 'bodyweight or dumbbells' },
      { v: 'gym', label: 'At the gym', hint: 'full equipment' },
      { v: 'both', label: 'A bit of both', hint: 'whatever the week allows' },
    ],
  },
];

function recommend(a: Answers): { slugs: string[]; why: string } {
  if (a.stage === 'pregnancy') return { slugs: ['reconnect-volume-1'], why: 'Breathing, pelvic-floor awareness and gradual strengthening: the right foundation for this season. Always get your healthcare provider’s go-ahead first.' };
  if (a.goal === 'food') return { slugs: ['nourish-volume-1'], why: 'Learn what protein, carbs, fats and micronutrients do, and build balanced meals around your life, without guilt.' };
  if (a.stage === 'experienced') return { slugs: ['strong-volume-1'], why: 'Purposeful sessions, progressive overload and clear performance goals for people with an established base.' };
  if (a.stage === 'basics') return { slugs: ['intermediate-volume-1'], why: 'More training volume, thoughtful progressions and new challenges, with technique still at the centre.' };
  if (a.goal === 'lose') return { slugs: ['move-volume-1', 'nourish-volume-1'], why: 'Strength to keep your muscle while you lose fat, plus eating you can actually maintain. A strong pair.' };
  return { slugs: ['move-volume-1'], why: `A welcoming, technique-first introduction to strength${a.place === 'home' ? ', and bodyweight or dumbbells at home works perfectly' : a.place === 'gym' ? ', at home or in the gym' : ''}.` };
}

/** "Not sure where to start?": three taps to a recommendation (into the basket, or to the contact form while checkout is off). */
export default function FitQuiz() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const done = step >= questions.length;
  const result = done ? recommend(answers) : null;
  const picks = result ? result.slugs.map((s) => productBySlug.get(s)!).filter(Boolean) : [];
  const total = picks.reduce((sum, p) => sum + p.priceCents, 0);

  const choose = (key: keyof Answers, v: string) => {
    setAnswers((a) => ({ ...a, [key]: v }));
    setTimeout(() => setStep((s) => s + 1), 220);
  };

  return (
    <div className="quiz card">
      <div className="quiz-top">
        <div className="quiz-dots" aria-hidden="true">
          {questions.map((_, i) => <span key={i} className={i < step ? 'done' : i === step ? 'now' : ''} />)}
        </div>
        {step > 0 && <button type="button" className="quiz-back" onClick={() => setStep((s) => Math.max(0, s - 1))}>← Back</button>}
      </div>
      <AnimatePresence mode="wait">
        {!done ? (
          <motion.div key={step} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
            <p className="quiz-count">Question {step + 1} of {questions.length}</p>
            <h3 className="quiz-q">{questions[step]!.q}</h3>
            <div className="quiz-options">
              {questions[step]!.options.map((o) => {
                const key = questions[step]!.key;
                return (
                  <button key={o.v} type="button" className={answers[key] === o.v ? 'opt on' : 'opt'} onClick={() => choose(key, o.v)}>
                    <strong>{o.label}</strong>
                    <span>{o.hint}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div key="result" className="quiz-result" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
            <p className="quiz-count">Your best starting point</p>
            <h3>{picks.map((p) => p.name).join(' + ')}</h3>
            <p>{result!.why}</p>
            <div className="quiz-actions">
              {checkoutEnabled ? (
                <button type="button" className="btn btn-primary" onClick={() => addAndOpen(result!.slugs)}>
                  {picks.length > 1 ? `Add both · ${rand(total)}` : `Add ${picks[0]!.name} · ${rand(total)}`}
                </button>
              ) : (
                <a className="btn btn-primary" href={programContactHref(programs.find((p) => p.slug === result!.slugs[0])!)}>
                  {picks.length > 1 ? `Ask about ${picks.map((p) => p.name).join(' + ')}` : `Get ${picks[0]!.name} · ${rand(total)}`}
                </a>
              )}
              <button type="button" className="link-arrow" onClick={() => { setAnswers({}); setStep(0); }}>Start over</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
