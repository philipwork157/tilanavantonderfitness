import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { href, programContactHref } from '../config';
import type { Program } from '../programs';
import { addAndOpen, rand } from './shop/basket';

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

/**
 * What a recommendation points at: a strength-series step, or a focus program
 * by its drawing. Matching on these (not on slugs or names) keeps the quiz
 * working when Tilana renames a program or changes its web address.
 */
type Pick = { step: 1 | 2 | 3 } | { illustration: 'breath' | 'plate' };
const START: Pick = { step: 1 };
const NEXT: Pick = { step: 2 };
const ADVANCED: Pick = { step: 3 };
const PELVIC_FLOOR: Pick = { illustration: 'breath' };
const NUTRITION: Pick = { illustration: 'plate' };

function matches(p: Program, pick: Pick): boolean {
  return 'step' in pick ? p.series === 'strength' && p.step === pick.step : p.series === 'focus' && p.illustration === pick.illustration;
}

function recommend(a: Answers): { keys: Pick[]; why: string } {
  if (a.stage === 'pregnancy') return { keys: [PELVIC_FLOOR], why: 'Breathing, pelvic-floor awareness and gradual strengthening: the right foundation for this season. Always get your healthcare provider’s go-ahead first.' };
  if (a.goal === 'food') return { keys: [NUTRITION], why: 'Learn what protein, carbs, fats and micronutrients do, and build balanced meals around your life, without guilt.' };
  if (a.stage === 'experienced') return { keys: [ADVANCED], why: 'Purposeful sessions, progressive overload and clear performance goals for people with an established base.' };
  if (a.stage === 'basics') return { keys: [NEXT], why: 'More training volume, thoughtful progressions and new challenges, with technique still at the centre.' };
  if (a.goal === 'lose') return { keys: [START, NUTRITION], why: 'Strength to keep your muscle while you lose fat, plus eating you can actually maintain. A strong pair.' };
  return { keys: [START], why: `A welcoming, technique-first introduction to strength${a.place === 'home' ? ', and bodyweight or dumbbells at home works perfectly' : a.place === 'gym' ? ', at home or in the gym' : ''}.` };
}

/**
 * "Not sure where to start?": three taps to a recommendation (into the basket,
 * or to the contact form while checkout is off). Programs that are not for
 * sale right now are left out of the recommendation.
 */
export default function FitQuiz({ programs, checkout }: { programs: Program[]; checkout: boolean }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const done = step >= questions.length;
  const result = done ? recommend(answers) : null;
  const picks = result ? result.keys.map((pick) => programs.find((p) => matches(p, pick))).filter((p): p is Program => Boolean(p)) : [];
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
            {picks.length > 0 ? (
              <>
                <h3>{picks.map((p) => p.name).join(' + ')}</h3>
                <p>{result!.why}</p>
              </>
            ) : (
              <>
                <h3>Let’s find it together</h3>
                <p>The program I’d suggest isn’t available right now. Have a look at the others, or ask me what would suit you.</p>
              </>
            )}
            <div className="quiz-actions">
              {picks.length === 0 ? (
                <a className="btn btn-primary" href={href('/contact')}>Ask Tilana</a>
              ) : checkout ? (
                <button type="button" className="btn btn-primary" onClick={() => addAndOpen(picks.map((p) => p.slug))}>
                  {picks.length > 1 ? `Add both · ${rand(total)}` : `Add ${picks[0]!.name} · ${rand(total)}`}
                </button>
              ) : (
                <a className="btn btn-primary" href={programContactHref(picks[0]!)}>
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
